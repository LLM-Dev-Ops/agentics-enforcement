import { describe, it, expect } from 'vitest';
import {
  validateGraphHierarchy,
  GraphHierarchyViolationError,
} from '../graph-hierarchy-validator.js';
import type { ExecutionGraph } from '../../contracts/index.js';

function makeValidGraph(): ExecutionGraph {
  return {
    nodes: [
      { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
      { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
      { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: ['a1'] },
      { id: 'a1', type: 'agent', name: 'agent-1', parent_id: 'r1', children_ids: [] },
    ],
    edges: [],
    validated: false,
  };
}

describe('validateGraphHierarchy', () => {
  it('valid 4-level tree passes with no violations', () => {
    const result = validateGraphHierarchy(makeValidGraph());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports correct node_count', () => {
    const result = validateGraphHierarchy(makeValidGraph());
    expect(result.node_count).toBe(4);
  });

  it('reports correct max_depth (root→core→repo→agent = 4)', () => {
    const result = validateGraphHierarchy(makeValidGraph());
    expect(result.max_depth).toBe(4);
  });

  it('reports missing_root when no execution_root exists', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'c1', type: 'core', name: 'Security-Core', parent_id: null, children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const missing = result.violations.filter((v) => v.type === 'missing_root');
    expect(missing).toHaveLength(1);
  });

  it('reports multiple_roots when >1 execution_root', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root1', type: 'execution_root', name: 'root-a', parent_id: null, children_ids: [] },
        { id: 'root2', type: 'execution_root', name: 'root-b', parent_id: null, children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const multi = result.violations.filter((v) => v.type === 'multiple_roots');
    expect(multi).toHaveLength(1);
    expect(multi[0].details.root_node_ids).toEqual(['root1', 'root2']);
  });

  it('reports root_has_parent when execution_root has non-null parent_id', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: 'someone', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const rootParent = result.violations.filter((v) => v.type === 'root_has_parent');
    expect(rootParent).toHaveLength(1);
    expect(rootParent[0].node_id).toBe('root');
  });

  it('reports orphan_node when non-root node has null parent_id', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: [] },
        { id: 'c1', type: 'core', name: 'core-orphan', parent_id: null, children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const orphans = result.violations.filter((v) => v.type === 'orphan_node');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].node_id).toBe('c1');
  });

  it('reports orphan_node when parent does not exist in graph', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: [] },
        { id: 'c1', type: 'core', name: 'core-lost', parent_id: 'nonexistent', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const orphans = result.violations.filter((v) => v.type === 'orphan_node');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].details.parent_id).toBe('nonexistent');
  });

  it('reports invalid_parent_child_type: root → agent', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['a1'] },
        { id: 'a1', type: 'agent', name: 'agent-bad', parent_id: 'root', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const hierarchy = result.violations.filter((v) => v.type === 'invalid_parent_child_type');
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].details.parent_type).toBe('execution_root');
    expect(hierarchy[0].details.child_type).toBe('agent');
  });

  it('reports invalid_parent_child_type: root → repo', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'repo-bad', parent_id: 'root', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const hierarchy = result.violations.filter((v) => v.type === 'invalid_parent_child_type');
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].details.parent_type).toBe('execution_root');
    expect(hierarchy[0].details.child_type).toBe('repo');
  });

  it('reports invalid_parent_child_type: core → agent (skipping repo)', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['a1'] },
        { id: 'a1', type: 'agent', name: 'agent-skip', parent_id: 'c1', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const hierarchy = result.violations.filter((v) => v.type === 'invalid_parent_child_type');
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].details.parent_type).toBe('core');
    expect(hierarchy[0].details.child_type).toBe('agent');
  });

  it('reports invalid_parent_child_type: repo → core (backwards)', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: ['c2'] },
        { id: 'c2', type: 'core', name: 'bad-nested-core', parent_id: 'r1', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const hierarchy = result.violations.filter((v) => v.type === 'invalid_parent_child_type');
    expect(hierarchy).toHaveLength(1);
    expect(hierarchy[0].details.parent_type).toBe('repo');
    expect(hierarchy[0].details.child_type).toBe('core');
  });

  it('collects multiple violations in a single pass', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['a1', 'r1'] },
        // agent under root (invalid hierarchy)
        { id: 'a1', type: 'agent', name: 'agent-bad', parent_id: 'root', children_ids: [] },
        // repo under root (invalid hierarchy)
        { id: 'r1', type: 'repo', name: 'repo-bad', parent_id: 'root', children_ids: [] },
        // orphan core with null parent
        { id: 'c1', type: 'core', name: 'orphan-core', parent_id: null, children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    // At least: 2 invalid_parent_child_type + 1 orphan_node
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('never throws — always returns a result', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'a', type: 'agent', name: 'lonely', parent_id: 'b', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    expect(() => validateGraphHierarchy(graph)).not.toThrow();
  });

  it('handles empty graph (no nodes)', () => {
    const graph: ExecutionGraph = { nodes: [], edges: [], validated: false };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    expect(result.node_count).toBe(0);
    expect(result.max_depth).toBe(0);
    const missing = result.violations.filter((v) => v.type === 'missing_root');
    expect(missing).toHaveLength(1);
  });

  it('detects cycle in parent chain', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'core-a', parent_id: 'r1', children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'repo-a', parent_id: 'c1', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(false);
    const cycles = result.violations.filter((v) => v.type === 'cycle_detected');
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('validates partial hierarchy (root → core → repo) as valid', () => {
    const graph: ExecutionGraph = {
      nodes: [
        { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
        { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
        { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: [] },
      ],
      edges: [],
      validated: false,
    };
    const result = validateGraphHierarchy(graph);
    expect(result.valid).toBe(true);
    expect(result.max_depth).toBe(3);
  });
});

describe('GraphHierarchyViolationError', () => {
  it('includes violations on the error instance', () => {
    const violations = [
      { type: 'missing_root' as const, node_id: null, message: 'no root', details: {} },
    ];
    const err = new GraphHierarchyViolationError(violations);
    expect(err.violations).toBe(violations);
    expect(err.name).toBe('GraphHierarchyViolationError');
    expect(err.message).toContain('no root');
  });
});
