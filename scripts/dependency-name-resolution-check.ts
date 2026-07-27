/**
 * CI Enforcement Hook: dependency-name-resolution-check
 *
 * Resolves every cross-repo dependency declared in a repo's Cargo.toml and
 * package.json files against the source it names, and rejects any dependency
 * whose name does not exist at that source.
 *
 * Per ADR-015: a dependency declared under a name no repo in the fleet actually
 * publishes must fail at PR time, not at compile time in whichever repo builds
 * first. Per ADR-010: this hook runs on PR/push for all repos and blocks.
 *
 * Usage:
 *   node --import tsx scripts/dependency-name-resolution-check.ts [target-dir] [options]
 *
 * Options:
 *   --offline            Skip network-dependent rules (crates.io, npm, git refs).
 *                        Path, workspace and local-index rules always run.
 *   --fleet-root <dir>   Directory of sibling fleet repos, used to resolve npm
 *                        names that are declared in-repo but not published.
 *
 * Exits 0 on pass (warnings permitted), 1 if any blocking finding is reported.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allFindings, counters, type Finding } from './lib/findings.js';
import { SKIP_DIRS, walkManifests, type DiscoveredManifests } from './lib/fleet.js';
import { checkCargoManifest } from './lib/cargo-rules.js';
import { buildNpmIndex, checkNpmManifest } from './lib/npm-rules.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const offline = argv.includes('--offline');
  const fleetRootIndex = argv.indexOf('--fleet-root');
  const fleetRoot = fleetRootIndex === -1 ? null : argv[fleetRootIndex + 1];
  const positional = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--fleet-root');
  const targetDir = resolve(positional[0] ?? process.cwd());

  const manifests: DiscoveredManifests = { cargo: [], npm: [] };
  walkManifests(targetDir, manifests);

  const indexRoots = [targetDir];
  if (fleetRoot !== null) {
    for (const entry of readdirSync(fleetRoot)) {
      const full = join(fleetRoot, entry);
      if (statSync(full).isDirectory() && !SKIP_DIRS.has(entry)) indexRoots.push(full);
    }
  }
  const npmIndex = buildNpmIndex(indexRoots, fleetRoot !== null);

  for (const manifest of manifests.cargo) await checkCargoManifest(manifest, targetDir, offline);
  for (const manifest of manifests.npm) await checkNpmManifest(manifest, targetDir, offline, npmIndex);

  emitReport(manifests, offline);
}

function emitReport(manifests: DiscoveredManifests, offline: boolean): void {
  const findings = allFindings();
  const blocking = findings.filter((f) => f.severity === 'block');
  const warnings = findings.filter((f) => f.severity === 'warn');
  const scanned = `${manifests.cargo.length} Cargo.toml + ${manifests.npm.length} package.json, ${counters.dependenciesChecked} platform dependencies`;

  for (const finding of warnings) printFinding(finding, console.warn);

  if (blocking.length === 0) {
    console.log(
      `dependency-name-resolution-check: PASS (scanned ${scanned}` +
        `${warnings.length > 0 ? `, ${warnings.length} warning(s)` : ''}` +
        `${offline ? `, ${counters.skippedNetworkRules} network rule(s) skipped` : ''})`,
    );
    process.exit(0);
  }

  console.error(
    `dependency-name-resolution-check: FAIL — ${blocking.length} blocking finding(s), ` +
      `${warnings.length} warning(s) (scanned ${scanned})\n`,
  );
  for (const finding of blocking) printFinding(finding, console.error);
  console.error(
    'Every cross-repo dependency must resolve to a real package at the source it names (ADR-015).\n' +
      'Registry-form dependencies on platform crates are only permitted for verified-published crates;\n' +
      'everything else must use a git source pinned to a rev or tag.\n',
  );
  process.exit(1);
}

function printFinding(finding: Finding, write: (message: string) => void): void {
  write(`  [${finding.rule}] ${finding.file}:${finding.line} — ${finding.dep}`);
  write(`    ${finding.detail}`);
  if (finding.candidates !== undefined && finding.candidates.length > 0) {
    write(`    closest real candidates: ${finding.candidates.join(', ')}`);
  }
  write('');
}

main().catch((error: unknown) => {
  console.error(`dependency-name-resolution-check: ERROR — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
