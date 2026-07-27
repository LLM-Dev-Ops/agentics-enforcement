/**
 * npm dependency resolution rules (ADR-015): `github:` specifiers and semver
 * ranges on published `@llm-dev-ops/*` packages.
 */

import { relative, dirname } from 'node:path';
import { report, counters, type Where } from './findings.js';
import { PLATFORM_NPM_SCOPES, isFleetOrg, readJson, jsonKeyLine, walkManifests } from './fleet.js';
import { lookupNpmPackage, fetchGitRef, rangeIsSatisfiable, highestVersion } from './resolvers.js';

export interface FleetNpmIndex {
  versions: Map<string, string[]>;
  /** True when --fleet-root supplied sibling repos, making "absent" an authoritative answer. */
  authoritative: boolean;
}

export function buildNpmIndex(roots: string[], authoritative: boolean): FleetNpmIndex {
  const versions = new Map<string, string[]>();
  for (const root of roots) {
    const manifests: { cargo: string[]; npm: string[] } = { cargo: [], npm: [] };
    walkManifests(root, manifests);
    for (const path of manifests.npm) {
      const json = readJson(path);
      const name = json?.name;
      const version = json?.version;
      if (typeof name !== 'string' || typeof version !== 'string') continue;
      const existing = versions.get(name) ?? [];
      existing.push(version);
      versions.set(name, existing);
    }
  }
  return { versions, authoritative };
}

const GITHUB_SPECIFIER = /^(?:github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#(.+))?$/;

function parseGithubSpecifier(specifier: string): { org: string; repo: string; ref: string; path: string | null } | null {
  const isExplicit = /^(github:|git\+https:\/\/github\.com\/|https:\/\/github\.com\/)/.test(specifier);
  if (!isExplicit && !/^[\w.-]+\/[\w.-]+(#|$)/.test(specifier)) return null;
  const match = GITHUB_SPECIFIER.exec(specifier);
  if (match === null) return null;
  const fragment = match[3] ?? '';
  const pathPart = /(?:^|&)path:\/?([^&]+)/.exec(fragment);
  const ref = fragment.split('&')[0];
  return {
    org: match[1],
    repo: match[2],
    ref: ref === '' || ref.startsWith('path:') ? 'HEAD' : ref,
    path: pathPart === null ? null : pathPart[1].replace(/\/$/, ''),
  };
}

export async function checkNpmManifest(
  manifestPath: string,
  rootDir: string,
  offline: boolean,
  index: FleetNpmIndex,
): Promise<void> {
  const json = readJson(manifestPath);
  if (json === null) return;
  const file = relative(rootDir, manifestPath) || 'package.json';

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const table = json[section];
    if (typeof table !== 'object' || table === null) continue;
    for (const [name, rawSpecifier] of Object.entries(table as Record<string, unknown>)) {
      if (typeof rawSpecifier !== 'string') continue;
      const where = { file, line: jsonKeyLine(manifestPath, section, name), dep: name };
      const github = parseGithubSpecifier(rawSpecifier);
      if (github !== null) {
        counters.dependenciesChecked++;
        await checkNpmGithub(name, rawSpecifier, github, where, offline);
        continue;
      }
      if (!PLATFORM_NPM_SCOPES.some((scope) => name.startsWith(scope))) continue;
      if (!name.startsWith('@llm-dev-ops/')) continue;
      if (/^(workspace:|file:|link:|portal:|npm:)/.test(rawSpecifier)) continue;
      counters.dependenciesChecked++;
      await checkNpmRange(name, rawSpecifier, where, offline, index);
    }
  }
}

async function checkNpmGithub(
  name: string,
  specifier: string,
  github: { org: string; repo: string; ref: string; path: string | null },
  where: Where,
  offline: boolean,
): Promise<void> {
  if (!isFleetOrg(github.org)) return;
  if (offline) {
    counters.skippedNetworkRules++;
    return;
  }

  const url = `https://github.com/${github.org}/${github.repo}`;
  const contents = fetchGitRef(url, github.ref);
  if (!contents.ok) {
    report({
      ...where,
      severity: contents.reason === 'timeout' ? 'warn' : 'block',
      rule: 'npm-github',
      detail: `github specifier "${specifier}" could not be resolved: ${contents.detail}`,
    });
    return;
  }

  const manifestPath = github.path === null ? 'package.json' : `${github.path}/package.json`;
  const body = contents.read(manifestPath);
  if (body === null) {
    report({
      ...where,
      severity: 'block',
      rule: 'npm-github',
      detail: `${url} has no ${manifestPath} at ${github.ref}, so "${name}" cannot resolve from this specifier`,
      candidates: suggestPackagePaths(contents, name),
    });
    return;
  }

  let declared: unknown;
  try {
    declared = (JSON.parse(body) as { name?: unknown }).name;
  } catch {
    declared = undefined;
  }
  if (declared !== name) {
    report({
      ...where,
      severity: 'block',
      rule: 'npm-github',
      detail:
        `specifier "${specifier}" resolves to ${manifestPath} in ${url}, whose name is ` +
        `${typeof declared === 'string' ? `"${declared}"` : '(unset)'} — not "${name}"`,
      candidates: suggestPackagePaths(contents, name),
    });
  }
}

/** Locates sub-packages in the target repo that do carry the requested name. */
function suggestPackagePaths(
  contents: { read(path: string): string | null; manifests: Array<{ path: string }> },
  name: string,
): string[] {
  const suggestions: string[] = [];
  for (const candidate of ['package.json', 'sdk/ts/package.json', 'sdk/package.json', 'api/package.json',
    'packages/sdk/package.json', 'sdk/nodejs/package.json', 'frontend/package.json', 'npm/package.json']) {
    const body = contents.read(candidate);
    if (body === null) continue;
    try {
      if ((JSON.parse(body) as { name?: unknown }).name === name) {
        suggestions.push(`#path:/${dirname(candidate)}`);
      }
    } catch {
      continue;
    }
  }
  return suggestions;
}

async function checkNpmRange(
  name: string,
  range: string,
  where: Where,
  offline: boolean,
  index: FleetNpmIndex,
): Promise<void> {
  const local = index.versions.get(name) ?? [];
  if (offline) {
    if (local.length > 0 && !rangeIsSatisfiable(local, range)) {
      report({
        ...where,
        severity: 'block',
        rule: 'npm-range',
        detail: `no in-workspace version of "${name}" satisfies "${range}" (present: ${local.join(', ')})`,
      });
      return;
    }
    counters.skippedNetworkRules++;
    return;
  }

  const published = await lookupNpmPackage(name);
  const known = [...published.versions, ...local];
  if (known.length === 0) {
    report({
      ...where,
      severity: index.authoritative ? 'block' : 'warn',
      rule: 'npm-range',
      detail: index.authoritative
        ? `no package named "${name}" is published on npm or declared anywhere in the fleet`
        : `"${name}" is not published on the npm registry and no package in this workspace declares that ` +
          'name — the range cannot be verified (pass --fleet-root to resolve against sibling repos)',
    });
    return;
  }
  if (!rangeIsSatisfiable(known, range)) {
    report({
      ...where,
      severity: 'block',
      rule: 'npm-range',
      detail: `no known version of "${name}" satisfies "${range}" (highest: ${highestVersion(known) ?? 'none'})`,
    });
  }
}
