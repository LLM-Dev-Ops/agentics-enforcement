/**
 * CI Enforcement Hook: hierarchy-violation-check
 *
 * Scans foundational repo files for orchestration patterns that should
 * only exist in Tier-2 (execution engine) or Tier-3 (cores).
 *
 * Per ADR-010: Foundational repos (1–26) MUST NOT contain orchestration
 * patterns like execution_id generation, execution creation, graph
 * construction, or direct simulation engine usage.
 *
 * Forbidden patterns:
 *   - mintExecutionId()              — execution_id generation
 *   - createExecution()              — execution creation
 *   - ExecutionGraphSchema.parse     — execution graph construction
 *   - new SimulationEngine()         — direct engine instantiation
 *   - .dispatch()                    — direct dispatch call
 *
 * Exemptions:
 *   - Files with @tier1-meta-simulation annotation (per ADR-010)
 *   - Test files (*.test.*, *.spec.*, __tests__/)
 *
 * Usage:
 *   npx tsx scripts/hierarchy-violation-check.ts [target-dir] [exclude-dir]
 *
 * Defaults to scanning ./src if no target-dir is provided.
 * Exits 0 on pass, 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORBIDDEN_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /mintExecutionId\s*\(/, description: 'execution_id generation' },
  { pattern: /createExecution\s*\(/, description: 'execution creation' },
  { pattern: /ExecutionGraphSchema\.parse\s*\(/, description: 'execution graph construction' },
  { pattern: /new\s+SimulationEngine\s*\(/, description: 'direct simulation engine instantiation' },
  { pattern: /\.dispatch\s*\(/, description: 'direct dispatch call' },
];

interface Violation {
  file: string;
  line: number;
  pattern: string;
  content: string;
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

function scanFile(filePath: string, rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf-8');

  if (isMetaSimulationExempt(content)) return [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip import statements
    if (/^\s*import\s/.test(line)) continue;
    // Skip comments
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    for (const { pattern, description } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: relative(rootDir, filePath),
          line: i + 1,
          pattern: description,
          content: line.trim(),
        });
      }
    }
  }

  return violations;
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

const allViolations: Violation[] = [];
for (const file of filesToScan) {
  allViolations.push(...scanFile(file, targetDir));
}

if (allViolations.length === 0) {
  console.log(`hierarchy-violation-check: PASS (scanned ${filesToScan.length} files)`);
  process.exit(0);
} else {
  console.error(`hierarchy-violation-check: FAIL — ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — ${v.pattern}`);
    console.error(`    ${v.content}\n`);
  }
  console.error(
    'Foundational repos must not contain orchestration patterns (ADR-010).\n' +
    'Execution creation, graph construction, and dispatch belong in Tier-2/Tier-3.\n',
  );
  process.exit(1);
}
