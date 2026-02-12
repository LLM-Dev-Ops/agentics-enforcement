import { describe, it, expect } from 'vitest';
import { validateRepoAssignments, RepoAssignmentViolationError } from '../repo-guard.js';
import type { CoreStep } from '../graph-walker.js';
import type { GraphNode } from '../../contracts/index.js';

function makeRepoNode(name: string, parentId: string): GraphNode {
  return { id: `r-${name}`, type: 'repo', name, parent_id: parentId, children_ids: [] };
}

function makeAgentNode(name: string, parentId: string): GraphNode {
  return { id: `a-${name}`, type: 'agent', name, parent_id: parentId, children_ids: [] };
}

function makeCoreStep(coreName: string, childNodes: GraphNode[]): CoreStep {
  return { coreName, coreNodeId: `c-${coreName}`, childNodes };
}

describe('validateRepoAssignments', () => {
  it('returns empty array for valid assignments', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('Shield', 'c-Security-Core'),
        makeRepoNode('PolicyEngine', 'c-Security-Core'),
      ]),
    ];
    expect(validateRepoAssignments(steps)).toEqual([]);
  });

  it('returns empty array for steps with no repo nodes', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeAgentNode('agent-1', 'r-Shield'),
      ]),
    ];
    expect(validateRepoAssignments(steps)).toEqual([]);
  });

  it('returns empty array for empty steps', () => {
    expect(validateRepoAssignments([])).toEqual([]);
  });

  it('detects unauthorized repo under wrong core', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('CostOps', 'c-Security-Core'), // CostOps belongs to Governance-Core
      ]),
    ];
    const violations = validateRepoAssignments(steps);
    expect(violations).toHaveLength(1);
    expect(violations[0].coreName).toBe('Security-Core');
    expect(violations[0].repoName).toBe('CostOps');
    expect(violations[0].message).toBe('Core Security-Core cannot call repo CostOps');
  });

  it('detects multiple violations across cores', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('CostOps', 'c-Security-Core'),
      ]),
      makeCoreStep('Data-Core', [
        makeRepoNode('Orchestrator', 'c-Data-Core'),
      ]),
    ];
    const violations = validateRepoAssignments(steps);
    expect(violations).toHaveLength(2);
  });

  it('detects multiple violations in same core', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('CostOps', 'c-Security-Core'),
        makeRepoNode('MemoryGraph', 'c-Security-Core'),
      ]),
    ];
    const violations = validateRepoAssignments(steps);
    expect(violations).toHaveLength(2);
  });

  it('ignores agent nodes (only checks repo nodes)', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('Shield', 'c-Security-Core'),
        makeAgentNode('some-agent', 'r-Shield'),
      ]),
    ];
    expect(validateRepoAssignments(steps)).toEqual([]);
  });

  it('detects unknown repo as violation', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [
        makeRepoNode('UnknownRepo', 'c-Security-Core'),
      ]),
    ];
    const violations = validateRepoAssignments(steps);
    expect(violations).toHaveLength(1);
    expect(violations[0].repoName).toBe('UnknownRepo');
  });

  it('validates all four cores with correct repos', () => {
    const steps: CoreStep[] = [
      makeCoreStep('Security-Core', [makeRepoNode('Shield', 'c-Security-Core')]),
      makeCoreStep('Governance-Core', [makeRepoNode('CostOps', 'c-Governance-Core')]),
      makeCoreStep('Automation-Core', [makeRepoNode('Orchestrator', 'c-Automation-Core')]),
      makeCoreStep('Data-Core', [makeRepoNode('MemoryGraph', 'c-Data-Core')]),
    ];
    expect(validateRepoAssignments(steps)).toEqual([]);
  });
});

describe('RepoAssignmentViolationError', () => {
  it('includes violations array', () => {
    const violations = [
      { coreName: 'Security-Core', repoName: 'CostOps', message: 'Core Security-Core cannot call repo CostOps' },
    ];
    const error = new RepoAssignmentViolationError(violations);
    expect(error.violations).toEqual(violations);
    expect(error.name).toBe('RepoAssignmentViolationError');
  });

  it('has descriptive message', () => {
    const violations = [
      { coreName: 'A', repoName: 'B', message: 'Core A cannot call repo B' },
      { coreName: 'C', repoName: 'D', message: 'Core C cannot call repo D' },
    ];
    const error = new RepoAssignmentViolationError(violations);
    expect(error.message).toContain('Core A cannot call repo B');
    expect(error.message).toContain('Core C cannot call repo D');
  });
});
