import { describe, it, expect } from 'vitest';
import { extractCoreSteps, GraphCycleError } from '../graph-walker.js';
import type { ExecutionGraph } from '../../contracts/index.js';

function makeGraph(overrides: Partial<ExecutionGraph> = {}): ExecutionGraph {
  return {
    nodes: [],
    edges: [],
    validated: true,
    ...overrides,
  };
}

describe('extractCoreSteps', () => {
  it('returns empty array when graph has no core nodes', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: [] },
      ],
    });
    expect(extractCoreSteps(graph)).toEqual([]);
  });

  it('extracts a single core step', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'security-core', parent_id: 'root', children_ids: [] },
      ],
    });
    const steps = extractCoreSteps(graph);
    expect(steps).toHaveLength(1);
    expect(steps[0].coreName).toBe('security-core');
    expect(steps[0].coreNodeId).toBe('c1');
  });

  it('collects repo and agent child nodes under their core', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'security-core', parent_id: 'root', children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'policy-repo', parent_id: 'c1', children_ids: ['a1'] },
        { id: 'a1', type: 'agent', name: 'agent-1', parent_id: 'r1', children_ids: [] },
      ],
    });
    const steps = extractCoreSteps(graph);
    expect(steps[0].childNodes).toHaveLength(2);
    expect(steps[0].childNodes.map((n) => n.name)).toContain('policy-repo');
    expect(steps[0].childNodes.map((n) => n.name)).toContain('agent-1');
  });

  it('returns cores in topological order based on edges', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1', 'c2'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'root', children_ids: [] },
        { id: 'c2', type: 'core', name: 'core-b', parent_id: 'root', children_ids: [] },
      ],
      edges: [{ from: 'c1', to: 'c2' }], // c1 must run before c2
    });
    const steps = extractCoreSteps(graph);
    expect(steps).toHaveLength(2);
    expect(steps[0].coreName).toBe('core-a');
    expect(steps[1].coreName).toBe('core-b');
  });

  it('handles multiple independent cores (no edges)', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1', 'c2'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'root', children_ids: [] },
        { id: 'c2', type: 'core', name: 'core-b', parent_id: 'root', children_ids: [] },
      ],
    });
    const steps = extractCoreSteps(graph);
    expect(steps).toHaveLength(2);
  });

  it('throws GraphCycleError on cyclic core dependencies', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1', 'c2'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'root', children_ids: [] },
        { id: 'c2', type: 'core', name: 'core-b', parent_id: 'root', children_ids: [] },
      ],
      edges: [
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'c1' },
      ],
    });
    expect(() => extractCoreSteps(graph)).toThrow(GraphCycleError);
  });

  it('ignores edges between non-core nodes', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'root', children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'repo-1', parent_id: 'c1', children_ids: ['a1'] },
        { id: 'a1', type: 'agent', name: 'agent-1', parent_id: 'r1', children_ids: [] },
      ],
      edges: [{ from: 'r1', to: 'a1' }],
    });
    const steps = extractCoreSteps(graph);
    expect(steps).toHaveLength(1);
    expect(steps[0].coreName).toBe('core-a');
  });

  it('handles three cores with chain dependency', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1', 'c2', 'c3'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'root', children_ids: [] },
        { id: 'c2', type: 'core', name: 'core-b', parent_id: 'root', children_ids: [] },
        { id: 'c3', type: 'core', name: 'core-c', parent_id: 'root', children_ids: [] },
      ],
      edges: [
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'c3' },
      ],
    });
    const steps = extractCoreSteps(graph);
    expect(steps.map((s) => s.coreName)).toEqual(['core-a', 'core-b', 'core-c']);
  });
});
