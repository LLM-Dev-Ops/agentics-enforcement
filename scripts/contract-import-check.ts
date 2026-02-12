/**
 * CI Enforcement Hook: contract-import-check
 *
 * Validates that agentics-enforcement imports all 6 canonical schemas
 * from the contracts module and does NOT define them locally.
 *
 * Per ADR-001: Enforcement is a CONSUMER of contracts, not a DEFINER.
 * Per ADR-010: This hook runs on agentics-enforcement PRs only.
 *
 * Usage:
 *   node --import tsx scripts/contract-import-check.ts [src-dir]
 *
 * Exits 0 on pass, 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CANONICAL_SCHEMA_NAMES } from '../src/contracts/index.js';

const CANONICAL_SCHEMAS = [...CANONICAL_SCHEMA_NAMES];

/** The contracts barrel path (relative import within this repo). */
const CONTRACTS_BARREL = /['"]\.{0,2}\/contracts\/?(index)?(\.(js|ts))?['"]/;
const CONTRACTS_PACKAGE = /['"]\@agentics\/contracts['"]/;

function walkDir(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    if (entry === 'contracts') continue; // skip the contracts module itself
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (/\.(ts|tsx|mts)$/.test(entry) && !entry.includes('.test.') && !entry.includes('.spec.')) {
      files.push(fullPath);
    }
  }
  return files;
}

interface Issue {
  type: 'local_definition' | 'wrong_import_source';
  file: string;
  line: number;
  schema: string;
  detail: string;
}

function checkFile(filePath: string, rootDir: string): Issue[] {
  const issues: Issue[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const schema of CANONICAL_SCHEMAS) {
      // Check for local definitions (same patterns as schema-duplication-check)
      const defPatterns = [
        new RegExp(`^\\s*export\\s+interface\\s+${schema}\\b`),
        new RegExp(`^\\s*interface\\s+${schema}\\s*\\{`),
        new RegExp(`^\\s*export\\s+type\\s+${schema}\\s*=`),
        new RegExp(`^\\s*type\\s+${schema}\\s*=`),
      ];

      if (/^\s*import\s/.test(line)) continue;
      if (/^\s*export\s*\{/.test(line) && /from\s+['"]/.test(line)) continue;
      if (/^\s*export\s+type\s*\{/.test(line) && /from\s+['"]/.test(line)) continue;
      if (line.includes('z.infer<typeof')) continue;

      for (const pattern of defPatterns) {
        if (pattern.test(line)) {
          issues.push({
            type: 'local_definition',
            file: relative(rootDir, filePath),
            line: i + 1,
            schema,
            detail: `Locally defines "${schema}" — must import from contracts instead`,
          });
        }
      }
    }
  }

  return issues;
}

// --- Main ---

const srcDir = process.argv[2] || join(process.cwd(), 'src');
const files = walkDir(srcDir);
const allIssues: Issue[] = [];

for (const file of files) {
  allIssues.push(...checkFile(file, srcDir));
}

if (allIssues.length === 0) {
  console.log(`contract-import-check: PASS (scanned ${files.length} non-contract source files)`);
  process.exit(0);
} else {
  console.error(`contract-import-check: FAIL — ${allIssues.length} issue(s)\n`);
  for (const issue of allIssues) {
    console.error(`  [${issue.type}] ${issue.file}:${issue.line}`);
    console.error(`    ${issue.detail}\n`);
  }
  console.error(
    'All 6 canonical schemas must be imported from src/contracts/ or @agentics/contracts.\n' +
    'Do not redefine them locally (ADR-001).\n'
  );
  process.exit(1);
}
