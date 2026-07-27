/**
 * CI Enforcement Hook: mock-default-check
 *
 * Per ADR-011 Decision 4: `??`-defaulting to a mock implementation is prohibited
 * in any code reachable from a server entrypoint. Real implementations are built
 * from environment configuration; if that configuration is absent the service must
 * fail closed at startup rather than silently substituting a mock.
 *
 * Per ADR-011 Verification 2, this hook fails the build on:
 *   - `?? new Mock*(...)` / `|| new Mock*(...)`      (mock as nullish default)
 *   - `?? createMock*(...)` / `= createMock*Registry()` (mock factory as default)
 *   - importing a mock module (e.g. `integration/cores/mock-cores.js`)
 *
 * Reachability is computed for real: entrypoints are discovered, then relative
 * imports are followed transitively. A mock factory that is only reachable from
 * tests is NOT a violation — ADR-011 keeps those exported for test use.
 *
 * Usage:
 *   node --import tsx scripts/mock-default-check.ts [target-dir]
 *
 * Defaults to scanning ./src if no target-dir is provided.
 * Exits 0 on pass, 1 on violation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Test files are exempt from all ADR-010 hooks. */
function isTestFile(path: string): boolean {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)(__tests__|__mocks__|test|tests)\//.test(path)
  );
}

// ---------------------------------------------------------------------------
// Module graph
// ---------------------------------------------------------------------------

function walkDir(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (SOURCE_EXT.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * A server entrypoint is a module that actually stands up a listener, or is
 * conventionally named as the process entrypoint. Barrel files (index.ts) are
 * deliberately NOT entrypoints: they re-export everything, which would make the
 * whole repo "reachable" and flag test-only mock factories.
 */
const ENTRYPOINT_BASENAMES = /(^|\/)(server|main|app)\.[cm]?[jt]sx?$/;
const LISTENER_PATTERNS = [
  /\.listen\s*\(/,
  /createServer\s*\(/,
  /\bserve\s*\(\s*\{/,
  /app\.listen\b/,
];

function isEntrypoint(filePath: string, content: string): boolean {
  if (isTestFile(filePath)) return false;
  if (ENTRYPOINT_BASENAMES.test(filePath)) return true;
  return LISTENER_PATTERNS.some((p) => p.test(content));
}

/** Extract every module specifier this file imports / re-exports / dynamically imports. */
function extractSpecifiers(content: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

/**
 * Resolve a relative specifier to a real file on disk, tolerating the
 * TS/ESM convention of importing `./foo.js` for a `./foo.ts` source.
 */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // bare package — outside the repo graph
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base.replace(/\.mjs$/, '.mts'),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Files transitively reachable from any server entrypoint. */
function computeReachable(allFiles: string[]): { reachable: Set<string>; entrypoints: string[] } {
  const entrypoints = allFiles.filter((f) => isEntrypoint(f, readFileSync(f, 'utf-8')));
  const reachable = new Set<string>();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const content = readFileSync(current, 'utf-8');
    for (const spec of extractSpecifiers(content)) {
      const target = resolveSpecifier(current, spec);
      if (target && !reachable.has(target) && !isTestFile(target)) queue.push(target);
    }
  }

  return { reachable, entrypoints };
}

// ---------------------------------------------------------------------------
// Violation detection
// ---------------------------------------------------------------------------

interface Rule {
  id: string;
  detect: (line: string) => boolean;
  message: string;
}

/** True when a module specifier's own filename marks it as a mock module. */
function isMockSpecifier(spec: string): boolean {
  const basename = spec.split('/').pop() ?? spec;
  return /(^|[-_.])mocks?([-_.]|$)/i.test(basename);
}

const IMPORT_SPECIFIER = /\b(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/;

const RULES: Rule[] = [
  {
    id: 'mock-nullish-default',
    detect: (line) => /(\?\?|\|\|)\s*new\s+Mock[A-Za-z0-9_]*\s*\(/.test(line),
    message: 'mock instance used as a default (`?? new Mock...`)',
  },
  {
    id: 'mock-factory-default',
    detect: (line) => /(\?\?|\|\|)\s*create[A-Za-z0-9_]*Mock[A-Za-z0-9_]*\s*\(/i.test(line),
    message: 'mock factory used as a default (`?? createMock...()`)',
  },
  {
    id: 'mock-registry-assignment',
    detect: (line) => /=\s*create[A-Za-z0-9_]*Mock[A-Za-z0-9_]*\s*\(/.test(line),
    message: 'mock registry assigned in a server path (`= createMock...()`)',
  },
  {
    id: 'mock-module-import',
    detect: (line) => {
      const match = IMPORT_SPECIFIER.exec(line);
      if (!match) return false;
      return isMockSpecifier(match[1] ?? match[2]);
    },
    message: 'server path imports a mock module',
  },
];

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  content: string;
}

function scanFile(filePath: string, rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const lines = readFileSync(filePath, 'utf-8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue; // comments
    for (const rule of RULES) {
      if (rule.detect(line)) {
        violations.push({
          file: relative(rootDir, filePath),
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          content: trimmed,
        });
      }
    }
  }

  return violations;
}

// --- Main ---

const targetDir = process.argv[2] || join(process.cwd(), 'src');

if (!existsSync(targetDir)) {
  console.error(`mock-default-check: target directory not found: ${targetDir}`);
  process.exit(1);
}

const allFiles = walkDir(targetDir).filter((f) => !isTestFile(f));
const { reachable, entrypoints } = computeReachable(allFiles);

const allViolations: Violation[] = [];
for (const file of [...reachable].sort()) {
  allViolations.push(...scanFile(file, targetDir));
}

if (entrypoints.length === 0) {
  console.log(
    `mock-default-check: PASS (no server entrypoint found in ${targetDir}; ` +
      `scanned ${allFiles.length} files)`,
  );
  process.exit(0);
}

if (allViolations.length === 0) {
  console.log(
    `mock-default-check: PASS (${entrypoints.length} entrypoint(s), ` +
      `${reachable.size} reachable file(s))`,
  );
  process.exit(0);
} else {
  console.error(`mock-default-check: FAIL — ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — [${v.rule}] ${v.message}`);
    console.error(`    ${v.content}\n`);
  }
  console.error(
    'ADR-011 Decision 4: mocks may never be a default in a server path.\n' +
      'Construct real implementations from environment configuration and fail\n' +
      'closed at startup if that configuration is absent. Mock factories may\n' +
      'remain exported for tests, but must not be reachable from an entrypoint.\n',
  );
  process.exit(1);
}
