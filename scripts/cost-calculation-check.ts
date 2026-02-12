/**
 * CI Enforcement Hook: cost-calculation-check
 *
 * Scans a target directory for TypeScript/JavaScript files that contain
 * forbidden cost calculation patterns. Per ADR-007, only LLM-CostOps
 * may perform cost calculations. All other repos must use opaque CostReference handles.
 *
 * Forbidden patterns:
 *   - calculateCost()        — direct cost calculation calls
 *   - price_per_token        — token pricing references
 *   - providerPricingTable   — provider pricing table references
 *
 * Exemptions:
 *   - Files with @tier1-meta-simulation annotation (per ADR-010)
 *   - Test files (*.test.*, *.spec.*, files in __tests__/)
 *
 * Usage:
 *   npx tsx scripts/cost-calculation-check.ts [target-dir] [exclude-dir]
 *
 * Defaults to scanning ./src if no target-dir is provided.
 * Exits 0 on pass, 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const FORBIDDEN_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /calculateCost\s*\(/, description: 'direct cost calculation call' },
  { pattern: /price_per_token/, description: 'token pricing reference' },
  { pattern: /providerPricingTable/, description: 'provider pricing table reference' },
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
  // Check first 5 lines for @tier1-meta-simulation annotation
  const lines = content.split('\n').slice(0, 5);
  return lines.some((line) => line.includes('@tier1-meta-simulation'));
}

function scanFile(filePath: string, rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf-8');

  // Exemption: meta-simulation files
  if (isMetaSimulationExempt(content)) return [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip import statements — importing CostReference is allowed
    if (/^\s*import\s/.test(line)) continue;
    // Skip comments that just mention the pattern names
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
const excludeDir = process.argv[3]; // optional: directory to exclude (e.g., cost)

const allFiles = walkDir(targetDir);
const filesToScan = allFiles
  .filter((f) => !isTestFile(f))
  .filter((f) => (excludeDir ? !f.startsWith(join(targetDir, excludeDir)) : true));

const allViolations: Violation[] = [];
for (const file of filesToScan) {
  allViolations.push(...scanFile(file, targetDir));
}

if (allViolations.length === 0) {
  console.log(`cost-calculation-check: PASS (scanned ${filesToScan.length} files)`);
  process.exit(0);
} else {
  console.error(`cost-calculation-check: FAIL — ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — ${v.pattern}`);
    console.error(`    ${v.content}\n`);
  }
  console.error(
    'Cost calculations are owned exclusively by LLM-CostOps (ADR-007).\n' +
    'Use opaque CostReference handles instead of direct cost logic.\n',
  );
  process.exit(1);
}
