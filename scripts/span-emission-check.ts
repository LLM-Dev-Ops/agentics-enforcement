/**
 * CI Enforcement Hook: span-emission-check
 *
 * Scans execution-participating files for span creation calls.
 * Per ADR-010, this is a WARN-severity hook — it does not block merging.
 *
 * A file is considered "execution-participating" if it references:
 *   - execution_id, ExecutionIntent, dispatch, or enforce
 *
 * Execution-participating files SHOULD contain at least one span call:
 *   - createSpan(), SpanFactory, createRootSpan(), createCoreSpan(),
 *     createRepoSpan(), createAgentSpan(), createContractValidationSpan()
 *
 * Exemptions:
 *   - Test files (*.test.*, *.spec.*, __tests__/)
 *   - Files with @tier1-meta-simulation annotation
 *   - Pure type definition files
 *
 * Usage:
 *   npx tsx scripts/span-emission-check.ts [target-dir] [exclude-dir]
 *
 * Exits 0 always (warn severity). Prints PASS or WARN.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Patterns that indicate a file participates in execution paths. */
const EXECUTION_INDICATORS: RegExp[] = [
  /execution_id/,
  /ExecutionIntent/,
  /\.dispatch\s*\(/,
  /enforce\w*\s*\(/,
];

/** Patterns indicating span emission is present. */
const SPAN_PATTERNS: RegExp[] = [
  /createSpan\s*\(/,
  /SpanFactory/,
  /createRootSpan\s*\(/,
  /createCoreSpan\s*\(/,
  /createRepoSpan\s*\(/,
  /createAgentSpan\s*\(/,
  /createContractValidationSpan\s*\(/,
];

interface Warning {
  file: string;
  reason: string;
}

function isTestFile(filePath: string): boolean {
  if (/\.test\.[^.]+$/.test(filePath)) return true;
  if (/\.spec\.[^.]+$/.test(filePath)) return true;
  if (filePath.includes('__tests__')) return true;
  return false;
}

function isMetaSimulationExempt(content: string): boolean {
  const lines = content.split('\n').slice(0, 5);
  return lines.some((line) => line.includes('@tier1-meta-simulation'));
}

function isPureTypeFile(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  return lines.every(
    (l) =>
      /^\s*(export\s+)?(type|interface)\s/.test(l) ||
      /^\s*import\s/.test(l) ||
      /^\s*\/\//.test(l) ||
      /^\s*\*/.test(l) ||
      /^\s*\/\*/.test(l) ||
      /^\s*\}/.test(l) ||
      /^\s*\{/.test(l) ||
      /^\s*readonly\s/.test(l) ||
      /^\s*;?\s*$/.test(l) ||
      /^\s*export\s*\{/.test(l),
  );
}

function isExecutionParticipating(content: string): boolean {
  return EXECUTION_INDICATORS.some((pattern) => pattern.test(content));
}

function hasSpanEmission(content: string): boolean {
  return SPAN_PATTERNS.some((pattern) => pattern.test(content));
}

function scanFile(filePath: string, rootDir: string): Warning | null {
  const content = readFileSync(filePath, 'utf-8');

  if (isMetaSimulationExempt(content)) return null;
  if (isPureTypeFile(content)) return null;
  if (!isExecutionParticipating(content)) return null;
  if (hasSpanEmission(content)) return null;

  return {
    file: relative(rootDir, filePath),
    reason: 'execution-participating file lacks span creation calls',
  };
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

// --- Main ---

const targetDir = process.argv[2] || join(process.cwd(), 'src');
const excludeDir = process.argv[3];

const allFiles = walkDir(targetDir);
const filesToScan = allFiles
  .filter((f) => !isTestFile(f))
  .filter((f) => (excludeDir ? !f.startsWith(join(targetDir, excludeDir)) : true));

const warnings: Warning[] = [];
for (const file of filesToScan) {
  const warning = scanFile(file, targetDir);
  if (warning) warnings.push(warning);
}

if (warnings.length === 0) {
  console.log(`span-emission-check: PASS (scanned ${filesToScan.length} files)`);
} else {
  console.log(`span-emission-check: WARN — ${warnings.length} file(s) missing span emission\n`);
  for (const w of warnings) {
    console.log(`  ${w.file} — ${w.reason}`);
  }
  console.log(
    '\nExecution-participating files should emit observability spans.\n' +
    'Use SpanFactory or createSpan() to instrument execution paths.\n',
  );
}
process.exit(0);
