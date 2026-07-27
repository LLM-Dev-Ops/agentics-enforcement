/**
 * CI Enforcement Hook: fabricated-telemetry-check
 *
 * Per ADR-011 Decision 3: `layersExecuted`, `durationMs` and `completedAt` MUST be
 * derived from the actual pipeline result. A handler that did not execute a plan
 * MUST NOT report that it did.
 *
 * Per ADR-011 Verification 3, this hook fails the build on any array literal
 * assigned to `layersExecuted`. It additionally flags the no-op execution block
 * described in ADR-011 Break 2 — a `try { }` whose body contains only comments,
 * which makes the following `status` unconditional and the `catch` unreachable.
 *
 * Only statically unambiguous fabrication is flagged. Whether a `completedAt`
 * timestamp reflects real work is a dataflow property this text scanner cannot
 * decide, so it is deliberately left to the runner's own integration tests
 * (ADR-011 Verification 4).
 *
 * Usage:
 *   node --import tsx scripts/fabricated-telemetry-check.ts [target-dir]
 *
 * Defaults to scanning ./src if no target-dir is provided.
 * Exits 0 on pass, 1 on violation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Telemetry fields that must be observed, never asserted. ADR-011 Decision 3. */
const OBSERVED_STAGE_FIELDS = ['layersExecuted', 'layers_executed', 'stagesExecuted', 'stages_executed'];

function isTestFile(path: string): boolean {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    /(^|\/)(__tests__|__mocks__|test|tests)\//.test(path)
  );
}

/** ADR-010 exemption: tier-1 meta simulation files. */
function isExempt(content: string): boolean {
  return content.includes('@tier1-meta-simulation');
}

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

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  content: string;
}

/**
 * Rule: hardcoded-stage-list.
 * Flags `layersExecuted: ['validation', ...]` and `layersExecuted = [...]`.
 * An empty array literal is permitted — it asserts nothing ran, which is honest.
 */
function scanStageLists(lines: string[], file: string): Violation[] {
  const violations: Violation[] = [];

  for (const field of OBSERVED_STAGE_FIELDS) {
    const pattern = new RegExp(`\\b${field}\\s*[:=]\\s*\\[([^\\]]*)\\]`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      const match = pattern.exec(line);
      if (!match) continue;
      if (match[1].trim() === '') continue; // `[]` asserts nothing — allowed
      violations.push({
        file,
        line: i + 1,
        rule: 'hardcoded-stage-list',
        message: `array literal assigned to "${field}" — stage lists must be observed, not asserted`,
        content: trimmed,
      });
    }
  }

  return violations;
}

/**
 * Rule: empty-execution-block.
 * Flags `try { <comments only> }` — the ADR-011 Break 2 pattern, where the block
 * that was supposed to execute work is empty, making the surrounding status
 * unconditional and the `catch` unreachable.
 */
function scanEmptyTryBlocks(lines: string[], file: string): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/\btry\s*\{/.test(lines[i])) continue;

    // Same-line `try { ... }` — check whether anything sits between the braces.
    const sameLine = /\btry\s*\{([^}]*)\}/.exec(lines[i]);
    if (sameLine) {
      if (stripComments(sameLine[1]).trim() === '') {
        violations.push({
          file,
          line: i + 1,
          rule: 'empty-execution-block',
          message: 'empty `try` block — no work is performed, so any status it guards is unconditional',
          content: lines[i].trim(),
        });
      }
      continue;
    }

    // Multi-line: walk forward to the matching close brace.
    let depth = 0;
    let body = '';
    let closed = false;
    for (let j = i; j < lines.length && !closed; j++) {
      const segment = j === i ? lines[j].slice(lines[j].indexOf('try')) : lines[j];
      for (const ch of segment) {
        if (ch === '{') {
          depth++;
          if (depth === 1) continue; // opening brace of the try block itself
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            closed = true;
            break;
          }
        }
        if (depth >= 1) body += ch;
      }
      if (!closed) body += '\n';
    }

    if (closed && stripComments(body).trim() === '') {
      violations.push({
        file,
        line: i + 1,
        rule: 'empty-execution-block',
        message: 'empty `try` block — no work is performed, so any status it guards is unconditional',
        content: lines[i].trim(),
      });
    }
  }

  return violations;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function scanFile(filePath: string, rootDir: string): Violation[] {
  const content = readFileSync(filePath, 'utf-8');
  if (isExempt(content)) return [];
  const lines = content.split('\n');
  const rel = relative(rootDir, filePath);
  return [...scanStageLists(lines, rel), ...scanEmptyTryBlocks(lines, rel)];
}

// --- Main ---

const targetDir = process.argv[2] || join(process.cwd(), 'src');

if (!existsSync(targetDir)) {
  console.error(`fabricated-telemetry-check: target directory not found: ${targetDir}`);
  process.exit(1);
}

const files = walkDir(targetDir).filter((f) => !isTestFile(f));
const allViolations: Violation[] = [];
for (const file of files) {
  allViolations.push(...scanFile(file, targetDir));
}

if (allViolations.length === 0) {
  console.log(`fabricated-telemetry-check: PASS (scanned ${files.length} files)`);
  process.exit(0);
} else {
  console.error(`fabricated-telemetry-check: FAIL — ${allViolations.length} violation(s) found\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — [${v.rule}] ${v.message}`);
    console.error(`    ${v.content}\n`);
  }
  console.error(
    'ADR-011 Decision 3: fanout requires observed evidence; fabrication is forbidden.\n' +
      'Derive layersExecuted, durationMs and completedAt from the actual pipeline\n' +
      'result, and do not call fireFanout on a path that executed nothing.\n',
  );
  process.exit(1);
}
