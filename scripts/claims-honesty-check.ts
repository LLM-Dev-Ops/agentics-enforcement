/**
 * CI Enforcement Hook: claims-honesty-check
 *
 * Per ADR-013: a reader-facing status claim is an assertion about the repository
 * and is subject to CI enforcement exactly like the invariants in ADR-010.
 *
 *   Rule 1 — quantitative badges must be generated, not typed.
 *   Rule 2 — "production ready" may not coexist with a roadmap that says otherwise.
 *   Rule 3 — placeholder org URLs block a production-ready claim.
 *   Rule 4 — a build-status claim requires a reproducible build (committed lockfile).
 *
 * Usage:
 *   node --import tsx scripts/claims-honesty-check.ts [target-dir]
 *
 * Defaults to the repo root. Each README found under the target is treated as
 * belonging to the repository rooted at its own directory.
 * Exits 0 on pass, 1 on violation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'target',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
]);

/** How deep to look for READMEs, and for roadmap files within a repo. */
const README_MAX_DEPTH = 2;
const ROADMAP_MAX_DEPTH = 3;

// ---------------------------------------------------------------------------
// Claim vocabulary
// ---------------------------------------------------------------------------

/** ADR-013 Rule 2/3 production-readiness vocabulary. */
const PRODUCTION_CLAIM_PATTERNS: RegExp[] = [
  /production[-_\s]?ready/i,
  /\bproduction[-_\s]release\b/i,
  /img\.shields\.io\/badge\/status-production/i,
  /img\.shields\.io\/badge\/version-1\.0\.0/i,
];

/** ADR-013 Rule 3 placeholder tokens. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\byour-org\b/i,
  /\byourusername\b/i,
  /\byour-username\b/i,
  /\byourorg\b/i,
];

/**
 * ADR-013 exemption: pre-release repos are skipped entirely. A repo that says
 * it is alpha is not making the claim the rules police.
 */
const PRE_RELEASE_PATTERNS: RegExp[] = [
  /status:\s*\**\s*(experimental|alpha|beta|wip|pre-release|pre-1\.0)/i,
  /img\.shields\.io\/badge\/status-(alpha|beta|experimental|wip)/i,
  /^\s*>\s*\**status:\s*\**\s*pre-1\.0/im,
];

/** ADR-013 Rule 2 exemption annotation for forward-looking roadmaps. */
const POST_1_0_ANNOTATION = '@post-1.0-roadmap';

/** ADR-013 Rule 4 build-success claim vocabulary. */
const BUILD_CLAIM_PATTERNS: RegExp[] = [
  /img\.shields\.io\/badge\/build-passing/i,
  /zero compilation errors/i,
];

// ---------------------------------------------------------------------------
// Rule 1 — badge parsing
// ---------------------------------------------------------------------------

/**
 * Metric labels that denote a measured quantity. Per ADR-013 Implementation
 * Plan step 2, plus `throughput` as the concrete spelling of the "RPS" the
 * Decision names (connector-hub/README.md:6 uses `throughput-46K ops/s`).
 */
const MEASURED_METRICS = /^(coverage|tests?|rps|throughput|latency|uptime|build|passing)$/i;

/** A literal measurement: starts with a digit, or is a build verdict. */
const LITERAL_VALUE = /^(\d|passing$|failing$|success$)/i;

const SHIELDS_BADGE = /img\.shields\.io\/badge\/([^)\s"'\]]+)/gi;

/**
 * Split a shields badge path into its label/message/color segments, honouring
 * shields' `--` escape for a literal dash (e.g. `license-Apache--2.0-blue`).
 */
function splitBadgeSegments(badgePath: string): string[] {
  // A segment is a run of non-dash characters and `--` pairs; a lone `-` separates.
  const segments = badgePath.match(/(?:[^-]|--)+/g) ?? [];
  return segments.map((segment) => segment.replace(/--/g, '-'));
}

function stripExtension(segment: string): string {
  return segment.replace(/\.(svg|png|jpg)$/i, '');
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function findFiles(dir: string, matcher: (name: string) => boolean, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      found.push(...findFiles(fullPath, matcher, maxDepth, depth + 1));
    } else if (matcher(entry)) {
      found.push(fullPath);
    }
  }
  return found;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** First 1-based line number matching any pattern, or null. */
function findLine(lines: string[], patterns: RegExp[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (matchesAny(lines[i], patterns)) return i + 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

/** Rule 1 — quantitative badges must be generated, not typed. */
function checkRule1(lines: string[], readmeRel: string): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(SHIELDS_BADGE)) {
      const segments = splitBadgeSegments(match[1]);
      if (segments.length < 2) continue;
      const label = stripExtension(segments[0]);
      const value = stripExtension(segments[1]);
      if (!MEASURED_METRICS.test(label)) continue;
      if (!LITERAL_VALUE.test(decodeURIComponent(value))) continue;
      violations.push({
        file: readmeRel,
        line: i + 1,
        rule: 'rule1-badge-not-generated',
        message:
          `hardcoded "${label}" badge asserting "${decodeURIComponent(value)}" — a measured ` +
          `quantity must be emitted by the CI run that computed it, not typed`,
      });
    }
  }

  return violations;
}

/** Rule 2 — a production claim may not coexist with a roadmap that says otherwise. */
function checkRule2(
  lines: string[],
  readmeRel: string,
  repoDir: string,
  rootDir: string,
  claimLine: number,
): Violation[] {
  const violations: Violation[] = [];

  const roadmaps = findFiles(
    repoDir,
    (name) => /COMPLETION_ROADMAP\.md$/i.test(name) || /^ROADMAP\.md$/i.test(name) || /COMPLETION.*\.md$/i.test(name),
    ROADMAP_MAX_DEPTH,
  );

  for (const roadmap of roadmaps) {
    const content = readFileSync(roadmap, 'utf-8');
    if (content.includes(POST_1_0_ANNOTATION)) continue; // exempt: forward-looking

    const roadmapLines = content.split('\n');
    let underGateHeading = false;

    for (let i = 0; i < roadmapLines.length; i++) {
      const line = roadmapLines[i];

      // Gate-bearing headings, and bold pseudo-headings like "**Production Gate:**".
      if (/^#{1,6}\s/.test(line) || /^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(line)) {
        underGateHeading = /gate|release|v1\.0|production/i.test(line);
        continue;
      }

      if (underGateHeading && /^\s*[-*]\s*\[\s\]/.test(line)) {
        violations.push({
          file: readmeRel,
          line: claimLine,
          rule: 'rule2-claim-contradicts-roadmap',
          message:
            `claims production readiness, but ${relative(rootDir, roadmap)}:${i + 1} carries an ` +
            `unchecked release gate: "${line.trim()}"`,
        });
        return violations; // one report per repo is enough to act on
      }
    }
  }

  return violations;
}

/** Rule 3 — placeholder org URLs block a production-ready claim. */
function checkRule3(lines: string[], readmeRel: string): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (matchesAny(lines[i], PLACEHOLDER_PATTERNS)) {
      violations.push({
        file: readmeRel,
        line: i + 1,
        rule: 'rule3-placeholder-with-production-claim',
        message:
          'placeholder org URL in a README that claims production readiness — ' +
          'a project whose clone command does not work has not shipped',
      });
    }
  }

  return violations;
}

/** Rule 4 — a build-status claim requires a committed lockfile. */
function checkRule4(lines: string[], readmeRel: string, repoDir: string): Violation[] {
  const claimLine = findLine(lines, BUILD_CLAIM_PATTERNS);
  if (claimLine === null) return [];

  const manifests: Array<{ manifest: string; lockfiles: string[] }> = [
    { manifest: 'Cargo.toml', lockfiles: ['Cargo.lock'] },
    { manifest: 'package.json', lockfiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'] },
    { manifest: 'go.mod', lockfiles: ['go.sum'] },
    { manifest: 'pyproject.toml', lockfiles: ['poetry.lock', 'uv.lock', 'requirements.txt'] },
  ];

  const violations: Violation[] = [];

  for (const { manifest, lockfiles } of manifests) {
    if (!existsSync(join(repoDir, manifest))) continue;
    if (lockfiles.some((lock) => existsSync(join(repoDir, lock)))) continue;
    violations.push({
      file: readmeRel,
      line: claimLine,
      rule: 'rule4-build-claim-without-lockfile',
      message:
        `asserts build success, but ${manifest} has no committed lockfile ` +
        `(${lockfiles.join(' / ')}) — the build is not reproducible`,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const targetDir = process.argv[2] || process.cwd();

if (!existsSync(targetDir)) {
  console.error(`claims-honesty-check: target directory not found: ${targetDir}`);
  process.exit(1);
}

const readmes = findFiles(targetDir, (name) => /^README\.md$/i.test(name), README_MAX_DEPTH);

const allViolations: Violation[] = [];
let skipped = 0;

for (const readme of readmes) {
  const content = readFileSync(readme, 'utf-8');
  const lines = content.split('\n');
  const repoDir = join(readme, '..');
  const readmeRel = relative(targetDir, readme) || 'README.md';

  // Exemption: pre-release repos are skipped for all rules.
  if (matchesAny(content, PRE_RELEASE_PATTERNS)) {
    skipped++;
    continue;
  }

  const claimLine = findLine(lines, PRODUCTION_CLAIM_PATTERNS);
  const claimsProduction = claimLine !== null;

  allViolations.push(...checkRule1(lines, readmeRel));
  allViolations.push(...checkRule4(lines, readmeRel, repoDir));

  if (claimsProduction) {
    allViolations.push(...checkRule2(lines, readmeRel, repoDir, targetDir, claimLine));
    allViolations.push(...checkRule3(lines, readmeRel));
  }
}

const summary = `${readmes.length} README(s), ${skipped} skipped as pre-release`;

if (allViolations.length === 0) {
  console.log(`claims-honesty-check: PASS (${summary})`);
  process.exit(0);
} else {
  console.error(`claims-honesty-check: FAIL — ${allViolations.length} violation(s) found (${summary})\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — ${v.rule} ${v.message}\n`);
  }
  console.error(
    'ADR-013: a reader-facing status claim is an assertion about the repository.\n' +
      'Either substantiate the claim (generate the badge in CI, check the release\n' +
      'gates, fix the clone URL, commit the lockfile) or delete the claim.\n' +
      'Deleting a badge is always a valid fix.\n',
  );
  process.exit(1);
}
