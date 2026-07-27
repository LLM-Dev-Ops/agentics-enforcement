/**
 * Fleet scope for dependency-name-resolution-check: which orgs count as fleet
 * provenance, which dependency names are platform names worth resolving, and
 * manifest discovery on disk.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Orgs whose git URLs and crates.io `repository` fields count as fleet provenance (ADR-015). */
export const ORG_ALLOWLIST = ['llm-dev-ops', 'globalbusinessadvisors', 'llm-devops'];

/**
 * Fleet repo stems, used to decide whether an unprefixed dependency name is a
 * platform name worth resolving. Enumerated from the LLM-Dev-Ops org listing.
 */
export const FLEET_REPO_STEMS = [
  'agentics-cli', 'agentics-contracts', 'agentics-deployment-exporters',
  'agentics-deployment-intent', 'agentics-diligence-artifacts', 'agentics-enforcement',
  'agentics-execution-engine', 'agentics-orchestration-engine', 'agentics-org-manifests',
  'agentics-platform', 'agentics-results-index', 'agentics-simulation-planner',
  'agentics-simulation-runner', 'agentics-usage-ledger', 'analytics-hub', 'auto-optimizer',
  'automation-core', 'benchmark-exchange', 'config-manager', 'connector-hub', 'copilot-agent',
  'cost-ops', 'data-core', 'data-vault', 'ecosystem-core', 'edge-agent', 'enterprise-roi-engine',
  'erp-surface', 'forge', 'governance-core', 'governance-dashboard', 'incident-manager',
  'inference-gateway', 'infra', 'integrations', 'intelligence-core', 'interface-core',
  'latency-lens', 'marketplace', 'memory-graph', 'observatory', 'orchestrator',
  'platform-agents', 'policy-engine', 'registry', 'research-core', 'research-lab',
  'ruvector-service', 'schema-registry', 'security-core', 'sentinel', 'shield', 'simulator',
  'test-bench',
];

export const PLATFORM_NAME_PREFIXES = ['llm-', 'infra-', 'agentics-', 'vault-', 'schema-registry-', 'connector-hub-'];
export const PLATFORM_NPM_SCOPES = ['@llm-dev-ops/', '@agentics/'];
export const CARGO_DEP_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];
export const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'coverage', 'vendor', '.test-fixtures']);

export interface DiscoveredManifests {
  cargo: string[];
  npm: string[];
}

// --- Manifest discovery ---

export function walkManifests(dir: string, out: DiscoveredManifests): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) walkManifests(fullPath, out);
    else if (entry === 'Cargo.toml') out.cargo.push(fullPath);
    else if (entry === 'package.json') out.npm.push(fullPath);
  }
}

export function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Best-effort 1-based line of a key inside a given JSON section, so findings point at file:line. */
export function jsonKeyLine(path: string, section: string, key: string): number {
  const lines = readFileSync(path, 'utf-8').split('\n');
  const start = lines.findIndex((line) => line.includes(`"${section}"`));
  const needle = `"${key}"`;
  for (let i = Math.max(start, 0); i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return 1;
}

// --- Scope ---

export function isPlatformCrateName(name: string): boolean {
  if (PLATFORM_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  return FLEET_REPO_STEMS.some((stem) => name === stem || name.startsWith(`${stem}-`));
}

export function isFleetOrg(org: string | null): boolean {
  return org !== null && ORG_ALLOWLIST.includes(org.toLowerCase());
}
