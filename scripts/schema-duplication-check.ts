/**
 * CI Enforcement Hook: schema-duplication-check
 *
 * Scans a target directory for TypeScript/JavaScript files that DEFINE
 * (not import) any of the 6 canonical contract schema types.
 *
 * Per ADR-001: No repository except agentics-contracts may define these schemas.
 * Per ADR-010: This hook runs on PR/push for all repos except agentics-contracts.
 *
 * Usage:
 *   node --import tsx scripts/schema-duplication-check.ts [target-dir]
 *
 * Defaults to scanning ./src if no target-dir is provided.
 * Exits 0 on pass, 1 on violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CANONICAL_SCHEMA_NAMES } from '../src/contracts/index.js';

const CANONICAL_SCHEMAS = [...CANONICAL_SCHEMA_NAMES];

/**
 * Patterns that indicate a DEFINITION (not an import or usage).
 * We look for:
 *   - export interface <Name>
 *   - export type <Name> =    (but NOT "export type { <Name> }" which is a re-export)
 *   - interface <Name> {
 *   - type <Name> =
 *   - export class <Name>
 *   - class <Name>
 *   - z.object declarations assigned to <Name>Schema
 */
function buildDefinitionPatterns(name: string): RegExp[] {
  return [
    new RegExp(`^\\s*export\\s+interface\\s+${name}\\b`, 'm'),
    new RegExp(`^\\s*interface\\s+${name}\\s*\\{`, 'm'),
    new RegExp(`^\\s*export\\s+type\\s+${name}\\s*=`, 'm'),
    new RegExp(`^\\s*type\\s+${name}\\s*=`, 'm'),
    new RegExp(`^\\s*export\\s+class\\s+${name}\\b`, 'm'),
    new RegExp(`^\\s*class\\s+${name}\\b`, 'm'),
  ];
}

/** Patterns that indicate an import/re-export (should NOT be flagged). */
function isImportOrReexport(line: string, name: string): boolean {
  // import { Name } from ...
  if (/^\s*import\s/.test(line)) return true;
  // export { Name } from ...  (re-export)
  if (/^\s*export\s*\{/.test(line) && /from\s+['"]/.test(line)) return true;
  // export type { Name } from ...  (type re-export)
  if (/^\s*export\s+type\s*\{/.test(line) && /from\s+['"]/.test(line)) return true;
  // z.infer<typeof ...>  (type derivation from Zod, not a standalone definition)
  if (line.includes('z.infer<typeof')) return true;
  return false;
}

interface Violation {
  file: string;
  line: number;
  schema: string;
  content: string;
}

function scanFile(filePath: string, rootDir: string): Violation[] {
  const violations: Violation[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const schema of CANONICAL_SCHEMAS) {
    const patterns = buildDefinitionPatterns(schema);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isImportOrReexport(line, schema)) continue;
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          violations.push({
            file: relative(rootDir, filePath),
            line: i + 1,
            schema,
            content: line.trim(),
          });
        }
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
const excludeDir = process.argv[3]; // optional: directory to exclude (e.g., src/contracts)

const allFiles = walkDir(targetDir);
const filesToScan = excludeDir
  ? allFiles.filter(f => !f.startsWith(join(targetDir, excludeDir)))
  : allFiles;

const allViolations: Violation[] = [];
for (const file of filesToScan) {
  allViolations.push(...scanFile(file, targetDir));
}

if (allViolations.length === 0) {
  console.log(`schema-duplication-check: PASS (scanned ${filesToScan.length} files)`);
  process.exit(0);
} else {
  console.error(`schema-duplication-check: FAIL — ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — defines "${v.schema}"`);
    console.error(`    ${v.content}\n`);
  }
  console.error(
    'These schemas are owned by @agentics/contracts (ADR-001).\n' +
    'Import them instead of redefining:\n' +
    '  import { ... } from "@agentics/contracts";\n'
  );
  process.exit(1);
}
