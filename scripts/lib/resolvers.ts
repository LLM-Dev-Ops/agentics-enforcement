/**
 * Source resolvers for dependency-name-resolution-check.
 *
 * Three backends, each cached for the lifetime of a run:
 *   - crates.io   : crate existence, published versions, `repository` provenance
 *   - npm registry: package existence and published versions
 *   - git         : bare shallow fetch of a pinned ref, then manifest enumeration
 *                   straight out of the object store (no working tree checkout)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import semver from 'semver';

const USER_AGENT = 'agentics-enforcement dependency-name-resolution-check';
const NETWORK_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 300_000;

export interface CratesIoCrate {
  exists: boolean;
  versions: string[];
  repository: string | null;
}

export interface NpmPackage {
  exists: boolean;
  versions: string[];
}

/** A `[package] name` found inside a git ref, with the manifest path it came from. */
export interface RefManifest {
  path: string;
  name: string;
}

export interface GitRefContents {
  ok: true;
  manifests: RefManifest[];
  /** Blob reader for arbitrary files at the same ref (used for npm package.json). */
  read(path: string): string | null;
}

export interface GitRefError {
  ok: false;
  reason: 'repo-unreachable' | 'ref-not-found' | 'timeout';
  detail: string;
}

const cratesCache = new Map<string, CratesIoCrate>();
const npmCache = new Map<string, NpmPackage>();
const gitCache = new Map<string, GitRefContents | GitRefError>();

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  if (response.status === 404) return { status: 404, body: null };
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return { status: response.status, body: await response.json() };
}

export async function lookupCrate(name: string): Promise<CratesIoCrate> {
  const cached = cratesCache.get(name);
  if (cached) return cached;

  const { status, body } = await fetchJson(
    `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
  );
  let result: CratesIoCrate;
  if (status === 404 || body === null) {
    result = { exists: false, versions: [], repository: null };
  } else {
    const payload = body as {
      crate?: { repository?: string | null };
      versions?: Array<{ num: string; yanked?: boolean }>;
    };
    result = {
      exists: true,
      versions: (payload.versions ?? []).filter((v) => !v.yanked).map((v) => v.num),
      repository: payload.crate?.repository ?? null,
    };
  }
  cratesCache.set(name, result);
  return result;
}

export async function lookupNpmPackage(name: string): Promise<NpmPackage> {
  const cached = npmCache.get(name);
  if (cached) return cached;

  const { status, body } = await fetchJson(
    `https://registry.npmjs.org/${name.replace('/', '%2f')}`,
  );
  const result: NpmPackage =
    status === 404 || body === null
      ? { exists: false, versions: [] }
      : { exists: true, versions: Object.keys((body as { versions?: object }).versions ?? {}) };
  npmCache.set(name, result);
  return result;
}

/**
 * Translates a Cargo version requirement into a node-semver range.
 * Cargo treats a bare `1.2` as caret; node-semver treats it as a wildcard match,
 * and Cargo's comma-separated conjunction is node-semver's space.
 */
export function cargoReqToSemverRange(req: string): string {
  return req
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => (/^\d/.test(part) ? `^${part}` : part))
    .join(' ');
}

export function rangeIsSatisfiable(versions: string[], range: string): boolean {
  const valid = versions.filter((v) => semver.valid(v) !== null);
  return semver.maxSatisfying(valid, range, { includePrerelease: false }) !== null;
}

export function highestVersion(versions: string[]): string | null {
  const valid = versions.filter((v) => semver.valid(v) !== null);
  if (valid.length === 0) return null;
  return valid.sort(semver.rcompare)[0];
}

export interface GitTarget {
  url: string;
  host: string | null;
  org: string | null;
  repo: string | null;
}

export function parseGitUrl(url: string): GitTarget {
  const cleaned = url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '');
  const ssh = /^git@([^:]+):([^/]+)\/(.+)$/.exec(cleaned);
  if (ssh) return { url, host: ssh[1], org: ssh[2], repo: ssh[3] };
  try {
    const parsed = new URL(cleaned);
    const segments = parsed.pathname.split('/').filter((s) => s !== '');
    return {
      url,
      host: parsed.host,
      org: segments[0] ?? null,
      repo: segments[1] ?? null,
    };
  } catch {
    return { url, host: null, org: null, repo: null };
  }
}

function cacheRoot(): string {
  const dir = join(tmpdir(), 'agentics-dep-resolution-cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function git(args: string[], cwd: string, timeout = 120_000): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function timedOut(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { killed?: boolean }).killed === true ||
      (error as { signal?: string }).signal === 'SIGTERM')
  );
}

/**
 * Shallow-fetches `ref` from `url` into a bare cache repo and enumerates the
 * Cargo manifests present at that ref. Cached per (url, ref) so a fleet-wide
 * sweep pays the fetch cost once per unique pin.
 */
export function fetchGitRef(url: string, ref: string): GitRefContents | GitRefError {
  const key = `${url}#${ref}`;
  const cached = gitCache.get(key);
  if (cached) return cached;

  const digest = createHash('sha256').update(key).digest('hex').slice(0, 16);
  const repoDir = join(cacheRoot(), digest);
  let result: GitRefContents | GitRefError;

  try {
    // A killed fetch leaves a truncated FETCH_HEAD behind, so completion is recorded
    // explicitly rather than inferred from the repo's own files.
    const marker = join(repoDir, 'agentics-fetch-complete');
    if (!existsSync(marker)) {
      rmSync(repoDir, { recursive: true, force: true });
      mkdirSync(repoDir, { recursive: true });
      git(['init', '-q', '--bare', '.'], repoDir);
      // Blobless partial clone: trees arrive up front, manifest blobs are pulled on
      // demand. On large fleet repos this is the difference between 1s and 2+ minutes.
      git(['config', 'extensions.partialClone', 'origin'], repoDir);
      git(['remote', 'add', 'origin', url], repoDir);
      try {
        git(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', ref], repoDir, FETCH_TIMEOUT_MS);
      } catch (refError) {
        result = classifyFetchFailure(url, ref, refError);
        gitCache.set(key, result);
        return result;
      }
      writeFileSync(marker, `${url}#${ref}\n`);
    }

    const tracked = git(['ls-tree', '-r', '--name-only', 'FETCH_HEAD'], repoDir)
      .split('\n')
      .filter((line) => line !== '');
    const read = (path: string): string | null => {
      if (!tracked.includes(path)) return null;
      try {
        return git(['cat-file', 'blob', `FETCH_HEAD:${path}`], repoDir, FETCH_TIMEOUT_MS);
      } catch {
        return null;
      }
    };

    const manifests: RefManifest[] = [];
    for (const path of tracked) {
      if (!path.endsWith('Cargo.toml')) continue;
      const body = read(path);
      if (body === null) continue;
      const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(stripPackageSection(body));
      if (name) manifests.push({ path, name: name[1] });
    }
    result = { ok: true, manifests, read };
  } catch (error) {
    result = {
      ok: false,
      reason: timedOut(error) ? 'timeout' : 'repo-unreachable',
      detail: errorText(error),
    };
  }

  gitCache.set(key, result);
  return result;
}

/** Narrows a manifest to its `[package]` section so `name` cannot be read from another table. */
function stripPackageSection(body: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^\s*\[package\]\s*(#.*)?$/.test(line));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function classifyFetchFailure(url: string, ref: string, refError: unknown): GitRefError {
  if (timedOut(refError)) {
    return { ok: false, reason: 'timeout', detail: `fetching ref "${ref}" timed out` };
  }
  try {
    execFileSync('git', ['ls-remote', '--exit-code', url, 'HEAD'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { ok: false, reason: 'ref-not-found', detail: `ref "${ref}" could not be fetched` };
  } catch (probeError) {
    if (timedOut(probeError)) {
      return { ok: false, reason: 'timeout', detail: `probing ${url} timed out` };
    }
    return {
      ok: false,
      reason: 'repo-unreachable',
      detail: `repository ${url} does not exist or is not reachable (${errorText(refError)})`,
    };
  }
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String((error as { stderr: unknown }).stderr ?? '').trim();
    if (stderr !== '') return stderr.split('\n').slice(-1)[0];
  }
  return error instanceof Error ? error.message : String(error);
}

/** Ranks known names by edit distance so a failure can name the real candidates. */
export function closestNames(target: string, candidates: string[], limit = 4): string[] {
  return candidates
    .map((name) => ({ name, score: editDistance(target, name) }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j < cols; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[cols - 1];
}
