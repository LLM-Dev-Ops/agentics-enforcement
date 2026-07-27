/**
 * Cargo dependency resolution rules (ADR-015): path, git, registry, and
 * `workspace = true` sources.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { parseToml, asTable, type TomlTable } from './toml-lite.js';
import { report, counters, type Where } from './findings.js';
import { ORG_ALLOWLIST, CARGO_DEP_TABLES, isPlatformCrateName, isFleetOrg } from './fleet.js';
import {
  lookupCrate,
  fetchGitRef,
  parseGitUrl,
  cargoReqToSemverRange,
  rangeIsSatisfiable,
  highestVersion,
  closestNames,
} from './resolvers.js';

interface CargoDep {
  key: string;
  crateName: string;
  spec: TomlTable | string;
  tablePath: string;
  line: number;
}

function collectCargoDeps(doc: ReturnType<typeof parseToml>): CargoDep[] {
  const deps: CargoDep[] = [];

  const visit = (table: TomlTable, path: string[]): void => {
    for (const [key, value] of Object.entries(table)) {
      const child = asTable(value);
      if (child === undefined) continue;
      const nextPath = [...path, key];
      if (nextPath[0] === 'patch' || nextPath[0] === 'replace') continue;
      if (CARGO_DEP_TABLES.includes(key)) {
        for (const [depKey, depValue] of Object.entries(child)) {
          const spec = asTable(depValue) ?? (typeof depValue === 'string' ? depValue : undefined);
          if (spec === undefined) continue;
          const alias = typeof spec === 'object' ? spec.package : undefined;
          deps.push({
            key: depKey,
            crateName: typeof alias === 'string' ? alias : depKey,
            spec,
            tablePath: nextPath.join('.'),
            line: doc.lines.get([...nextPath, depKey].join('.')) ?? doc.lines.get(nextPath.join('.')) ?? 1,
          });
        }
        continue;
      }
      visit(child, nextPath);
    }
  };

  visit(doc.root, []);
  return deps;
}

/** Nearest ancestor manifest declaring a `[workspace]` table. */
function findWorkspaceRoot(manifestPath: string, stopAt: string): string | null {
  let dir = dirname(manifestPath);
  for (;;) {
    const candidate = join(dir, 'Cargo.toml');
    if (existsSync(candidate)) {
      const doc = parseToml(readFileSync(candidate, 'utf-8'));
      if (asTable(doc.root.workspace) !== undefined) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir || !resolve(dir).startsWith(resolve(stopAt))) return null;
    dir = parent;
  }
}

function packageNameOf(manifestPath: string): string | null {
  if (!existsSync(manifestPath)) return null;
  const pkg = asTable(parseToml(readFileSync(manifestPath, 'utf-8')).root.package);
  const name = pkg?.name;
  return typeof name === 'string' ? name : null;
}

function isUnpublishedOptOut(doc: ReturnType<typeof parseToml>): boolean {
  const metadata = asTable(asTable(asTable(doc.root.package)?.metadata)?.agentics);
  return metadata?.unpublished === true;
}

export async function checkCargoManifest(
  manifestPath: string,
  rootDir: string,
  offline: boolean,
): Promise<void> {
  const doc = parseToml(readFileSync(manifestPath, 'utf-8'));
  const file = relative(rootDir, manifestPath) || 'Cargo.toml';
  const unpublishedOptOut = isUnpublishedOptOut(doc);

  for (const dep of collectCargoDeps(doc)) {
    const spec = dep.spec;
    const where = { file, line: dep.line, dep: dep.key };

    const isPlatformName = isPlatformCrateName(dep.crateName) || isPlatformCrateName(dep.key);

    if (typeof spec === 'string') {
      if (!isPlatformName) continue;
      counters.dependenciesChecked++;
      await checkCargoRegistry(dep.crateName, spec, where, offline, unpublishedOptOut);
      continue;
    }

    if (typeof spec.path === 'string') {
      if (!isPlatformName) continue;
      counters.dependenciesChecked++;
      checkCargoPath(dep, spec.path, manifestPath, where);
      continue;
    }

    if (typeof spec.git === 'string') {
      if (!isPlatformName && !isFleetOrg(parseGitUrl(spec.git).org)) continue;
      counters.dependenciesChecked++;
      await checkCargoGit(dep, spec, where, offline);
      continue;
    }

    if (spec.workspace === true) {
      if (!isPlatformName) continue;
      counters.dependenciesChecked++;
      checkCargoWorkspaceInherit(dep, manifestPath, rootDir, where);
      continue;
    }

    if (typeof spec.version === 'string') {
      if (!isPlatformName) continue;
      counters.dependenciesChecked++;
      await checkCargoRegistry(dep.crateName, spec.version, where, offline, unpublishedOptOut);
    }
  }
}

function checkCargoPath(dep: CargoDep, path: string, manifestPath: string, where: Where): void {
  const targetManifest = join(dirname(manifestPath), path, 'Cargo.toml');
  const actual = packageNameOf(targetManifest);
  if (actual === null) {
    report({
      ...where,
      severity: 'block',
      rule: 'cargo-path',
      detail: `path dependency points at "${path}", which has no readable Cargo.toml with a [package] name`,
    });
    return;
  }
  if (actual !== dep.crateName) {
    report({
      ...where,
      severity: 'block',
      rule: 'cargo-path',
      detail:
        `declared as "${dep.crateName}" but ${path}/Cargo.toml declares [package] name = "${actual}"`,
      candidates: [actual],
    });
  }
}

async function checkCargoGit(
  dep: CargoDep,
  spec: TomlTable,
  where: Where,
  offline: boolean,
): Promise<void> {
  const url = spec.git as string;
  const target = parseGitUrl(url);

  if (target.host !== null && /github\.com$/i.test(target.host) && !isFleetOrg(target.org)) {
    report({
      ...where,
      severity: 'warn',
      rule: 'cargo-git',
      detail: `git source org "${target.org}" is not an allowlisted fleet org (${ORG_ALLOWLIST.join(', ')})`,
    });
  }

  if (offline) {
    counters.skippedNetworkRules++;
    return;
  }

  const ref =
    (typeof spec.rev === 'string' && spec.rev) ||
    (typeof spec.tag === 'string' && `refs/tags/${spec.tag}`) ||
    (typeof spec.branch === 'string' && spec.branch) ||
    'HEAD';

  const contents = fetchGitRef(url, ref);
  if (!contents.ok) {
    // A timeout is a CI condition, not a naming defect — never block on it.
    report({
      ...where,
      severity: contents.reason === 'timeout' ? 'warn' : 'block',
      rule: 'cargo-git',
      detail:
        contents.reason === 'ref-not-found'
          ? `git source ${url} exists but ${contents.detail}`
          : `git source ${url} could not be resolved: ${contents.detail}`,
    });
    return;
  }

  const names = contents.manifests.map((m) => m.name);
  if (!names.includes(dep.crateName)) {
    report({
      ...where,
      severity: 'block',
      rule: 'cargo-git',
      detail: `no crate named "${dep.crateName}" exists in ${url} at ${describeRef(spec)}`,
      candidates: closestNames(dep.crateName, names),
    });
  }
}

function describeRef(spec: TomlTable): string {
  if (typeof spec.rev === 'string') return `rev ${spec.rev}`;
  if (typeof spec.tag === 'string') return `tag ${spec.tag}`;
  if (typeof spec.branch === 'string') return `branch ${spec.branch}`;
  return 'the default branch';
}

function checkCargoWorkspaceInherit(
  dep: CargoDep,
  manifestPath: string,
  rootDir: string,
  where: Where,
): void {
  if (dep.tablePath.startsWith('workspace.')) return;
  const workspaceManifest = findWorkspaceRoot(manifestPath, rootDir);
  if (workspaceManifest === null) {
    report({
      ...where,
      severity: 'warn',
      rule: 'cargo-workspace',
      detail: 'declares `workspace = true` but no ancestor manifest with a [workspace] table was found in this repo',
    });
    return;
  }
  const doc = parseToml(readFileSync(workspaceManifest, 'utf-8'));
  const table = asTable(asTable(doc.root.workspace)?.dependencies) ?? {};
  if (!(dep.key in table)) {
    report({
      ...where,
      severity: 'block',
      rule: 'cargo-workspace',
      detail:
        `inherits "${dep.key}" from the workspace, but ${relative(rootDir, workspaceManifest)} ` +
        'does not declare it in [workspace.dependencies]',
      candidates: closestNames(dep.key, Object.keys(table)),
    });
  }
}

async function checkCargoRegistry(
  crateName: string,
  requirement: string,
  where: Where,
  offline: boolean,
  unpublishedOptOut: boolean,
): Promise<void> {
  if (offline) {
    counters.skippedNetworkRules++;
    return;
  }
  const crate = await lookupCrate(crateName);
  if (!crate.exists) {
    report({
      ...where,
      severity: unpublishedOptOut ? 'warn' : 'block',
      rule: 'cargo-registry',
      detail:
        `crate "${crateName}" is not published on crates.io; a registry-source dependency cannot resolve. ` +
        'Use a git source pinned to a rev or tag (ADR-015 decision 4)',
    });
    return;
  }

  const range = cargoReqToSemverRange(requirement);
  if (!rangeIsSatisfiable(crate.versions, range)) {
    report({
      ...where,
      severity: unpublishedOptOut ? 'warn' : 'block',
      rule: 'cargo-registry',
      detail:
        `crates.io has no published version of "${crateName}" satisfying "${requirement}" ` +
        `(highest published: ${highestVersion(crate.versions) ?? 'none'})`,
    });
    return;
  }

  const repoOrg = crate.repository === null ? null : parseGitUrl(crate.repository).org;
  if (!isFleetOrg(repoOrg)) {
    report({
      ...where,
      severity: 'warn',
      rule: 'cargo-registry',
      detail:
        `crates.io "${crateName}" declares repository ${crate.repository ?? '(none)'}, which is not in the ` +
        `fleet org allowlist (${ORG_ALLOWLIST.join(', ')}) — verify this is not a name squat`,
    });
  }
}
