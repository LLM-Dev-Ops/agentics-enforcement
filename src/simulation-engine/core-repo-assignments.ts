/**
 * Core-to-Repo Assignment Map — Immutable, static, frozen.
 *
 * The single source of truth for which foundational repos each Core is
 * permitted to call. These assignments are hardcoded and cannot be
 * modified at runtime. Any repo invoked outside its assigned core is
 * rejected by the Repo Guard.
 *
 * Security-Core  → Shield, PolicyEngine, IncidentManager
 * Governance-Core → CostOps, GovernanceDashboard
 * Automation-Core → Orchestrator, AutoOptimizer
 * Data-Core      → MemoryGraph, Registry, DataVault
 */

export type CoreName =
  | 'Security-Core'
  | 'Governance-Core'
  | 'Automation-Core'
  | 'Data-Core';

export type RepoName =
  | 'Shield'
  | 'PolicyEngine'
  | 'IncidentManager'
  | 'CostOps'
  | 'GovernanceDashboard'
  | 'Orchestrator'
  | 'AutoOptimizer'
  | 'MemoryGraph'
  | 'Registry'
  | 'DataVault';

export const CORE_NAMES: readonly CoreName[] = [
  'Security-Core',
  'Governance-Core',
  'Automation-Core',
  'Data-Core',
] as const;

export const REPO_NAMES: readonly RepoName[] = [
  'Shield',
  'PolicyEngine',
  'IncidentManager',
  'CostOps',
  'GovernanceDashboard',
  'Orchestrator',
  'AutoOptimizer',
  'MemoryGraph',
  'Registry',
  'DataVault',
] as const;

/** Immutable assignment map. Object.freeze prevents runtime mutation. */
export const CORE_REPO_ASSIGNMENTS: ReadonlyMap<CoreName, readonly RepoName[]> = Object.freeze(
  new Map<CoreName, readonly RepoName[]>([
    ['Security-Core', Object.freeze<RepoName[]>(['Shield', 'PolicyEngine', 'IncidentManager'])],
    ['Governance-Core', Object.freeze<RepoName[]>(['CostOps', 'GovernanceDashboard'])],
    ['Automation-Core', Object.freeze<RepoName[]>(['Orchestrator', 'AutoOptimizer'])],
    ['Data-Core', Object.freeze<RepoName[]>(['MemoryGraph', 'Registry', 'DataVault'])],
  ]),
);

/** Check if a repo is assigned to a specific core. */
export function isRepoAssignedToCore(repoName: string, coreName: string): boolean {
  const repos = CORE_REPO_ASSIGNMENTS.get(coreName as CoreName);
  if (!repos) return false;
  return repos.includes(repoName as RepoName);
}

/** Get the list of repos assigned to a core. Returns null for unknown cores. */
export function getAssignedRepos(coreName: string): readonly RepoName[] | null {
  return CORE_REPO_ASSIGNMENTS.get(coreName as CoreName) ?? null;
}

/** Find which core a repo is assigned to. Returns null for unknown repos. */
export function getAssignedCore(repoName: string): CoreName | null {
  for (const [core, repos] of CORE_REPO_ASSIGNMENTS) {
    if (repos.includes(repoName as RepoName)) {
      return core;
    }
  }
  return null;
}
