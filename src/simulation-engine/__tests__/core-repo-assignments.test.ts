import { describe, it, expect } from 'vitest';
import {
  CORE_REPO_ASSIGNMENTS,
  CORE_NAMES,
  REPO_NAMES,
  isRepoAssignedToCore,
  getAssignedRepos,
  getAssignedCore,
  type CoreName,
  type RepoName,
} from '../core-repo-assignments.js';

describe('CORE_REPO_ASSIGNMENTS', () => {
  it('has exactly 4 cores', () => {
    expect(CORE_REPO_ASSIGNMENTS.size).toBe(4);
  });

  it('Security-Core → Shield, PolicyEngine, IncidentManager', () => {
    expect([...CORE_REPO_ASSIGNMENTS.get('Security-Core')!]).toEqual([
      'Shield', 'PolicyEngine', 'IncidentManager',
    ]);
  });

  it('Governance-Core → CostOps, GovernanceDashboard', () => {
    expect([...CORE_REPO_ASSIGNMENTS.get('Governance-Core')!]).toEqual([
      'CostOps', 'GovernanceDashboard',
    ]);
  });

  it('Automation-Core → Orchestrator, AutoOptimizer', () => {
    expect([...CORE_REPO_ASSIGNMENTS.get('Automation-Core')!]).toEqual([
      'Orchestrator', 'AutoOptimizer',
    ]);
  });

  it('Data-Core → MemoryGraph, Registry, DataVault', () => {
    expect([...CORE_REPO_ASSIGNMENTS.get('Data-Core')!]).toEqual([
      'MemoryGraph', 'Registry', 'DataVault',
    ]);
  });

  it('CORE_NAMES has 4 entries', () => {
    expect(CORE_NAMES).toHaveLength(4);
  });

  it('REPO_NAMES has 10 entries', () => {
    expect(REPO_NAMES).toHaveLength(10);
  });

  it('every repo appears in exactly one core', () => {
    const allRepos: RepoName[] = [];
    for (const repos of CORE_REPO_ASSIGNMENTS.values()) {
      allRepos.push(...repos);
    }
    expect(allRepos).toHaveLength(10);
    expect(new Set(allRepos).size).toBe(10);
  });

  it('assignment map is frozen (immutable)', () => {
    // Map itself is frozen
    expect(Object.isFrozen(CORE_REPO_ASSIGNMENTS)).toBe(true);
    // Each repo array is frozen
    for (const repos of CORE_REPO_ASSIGNMENTS.values()) {
      expect(Object.isFrozen(repos)).toBe(true);
    }
  });
});

describe('isRepoAssignedToCore', () => {
  it('returns true for valid assignment', () => {
    expect(isRepoAssignedToCore('Shield', 'Security-Core')).toBe(true);
    expect(isRepoAssignedToCore('CostOps', 'Governance-Core')).toBe(true);
    expect(isRepoAssignedToCore('MemoryGraph', 'Data-Core')).toBe(true);
  });

  it('returns false for invalid assignment', () => {
    expect(isRepoAssignedToCore('Shield', 'Data-Core')).toBe(false);
    expect(isRepoAssignedToCore('CostOps', 'Security-Core')).toBe(false);
  });

  it('returns false for unknown core', () => {
    expect(isRepoAssignedToCore('Shield', 'Unknown-Core')).toBe(false);
  });

  it('returns false for unknown repo', () => {
    expect(isRepoAssignedToCore('Unknown-Repo', 'Security-Core')).toBe(false);
  });
});

describe('getAssignedRepos', () => {
  it('returns repos for known core', () => {
    const repos = getAssignedRepos('Security-Core');
    expect(repos).toEqual(['Shield', 'PolicyEngine', 'IncidentManager']);
  });

  it('returns null for unknown core', () => {
    expect(getAssignedRepos('Nonexistent-Core')).toBeNull();
  });
});

describe('getAssignedCore', () => {
  it('returns core for known repo', () => {
    expect(getAssignedCore('Shield')).toBe('Security-Core');
    expect(getAssignedCore('CostOps')).toBe('Governance-Core');
    expect(getAssignedCore('Orchestrator')).toBe('Automation-Core');
    expect(getAssignedCore('DataVault')).toBe('Data-Core');
  });

  it('returns null for unknown repo', () => {
    expect(getAssignedCore('Nonexistent-Repo')).toBeNull();
  });
});
