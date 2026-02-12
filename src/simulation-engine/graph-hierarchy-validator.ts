/**
 * Graph Hierarchy Validator — Validates ExecutionGraph node hierarchy.
 *
 * Strict hierarchy: execution_root → core → repo → agent
 *
 * Violations are collected and returned as an aggregate result — never throws.
 * Follows the same pattern as span-tree-validator.ts (DDD-005).
 */
import type { ExecutionGraph, GraphNode, NodeType } from '../contracts/index.js';

const VALID_GRAPH_CHILDREN: ReadonlyMap<NodeType, readonly NodeType[]> = new Map([
  ['execution_root', ['core']],
  ['core', ['repo']],
  ['repo', ['agent']],
  ['agent', []],
]);

export type HierarchyViolationType =
  | 'missing_root'
  | 'multiple_roots'
  | 'orphan_node'
  | 'invalid_parent_child_type'
  | 'root_has_parent'
  | 'cycle_detected';

export interface HierarchyViolation {
  readonly type: HierarchyViolationType;
  readonly node_id: string | null;
  readonly message: string;
  readonly details: Record<string, unknown>;
}

export interface GraphHierarchyValidationResult {
  readonly valid: boolean;
  readonly violations: readonly HierarchyViolation[];
  readonly node_count: number;
  readonly max_depth: number;
}

export class GraphHierarchyViolationError extends Error {
  override readonly name = 'GraphHierarchyViolationError';
  constructor(public readonly violations: readonly HierarchyViolation[]) {
    super(`Graph hierarchy violations: ${violations.map((v) => v.message).join('; ')}`);
  }
}

/**
 * Validate an ExecutionGraph for strict hierarchy correctness.
 * Returns violations as warnings — does NOT throw.
 */
export function validateGraphHierarchy(graph: ExecutionGraph): GraphHierarchyValidationResult {
  const violations: HierarchyViolation[] = [];
  const nodeIndex = new Map<string, GraphNode>();

  for (const node of graph.nodes) {
    nodeIndex.set(node.id, node);
  }

  // Rule 1: Exactly one execution_root
  const roots = graph.nodes.filter((n) => n.type === 'execution_root');
  if (roots.length === 0) {
    violations.push({
      type: 'missing_root',
      node_id: null,
      message: 'Graph has no execution_root node',
      details: {},
    });
  } else if (roots.length > 1) {
    violations.push({
      type: 'multiple_roots',
      node_id: roots[1].id,
      message: `Graph has ${roots.length} execution_root nodes, expected 1`,
      details: { root_node_ids: roots.map((r) => r.id) },
    });
  }

  // Rule 2: execution_root must have parent_id === null
  for (const root of roots) {
    if (root.parent_id !== null) {
      violations.push({
        type: 'root_has_parent',
        node_id: root.id,
        message: `execution_root '${root.id}' has non-null parent_id '${root.parent_id}'`,
        details: { parent_id: root.parent_id },
      });
    }
  }

  // Rule 3: Non-root nodes must have parent_id pointing to an existing node
  for (const node of graph.nodes) {
    if (node.type === 'execution_root') continue;
    if (node.parent_id === null) {
      violations.push({
        type: 'orphan_node',
        node_id: node.id,
        message: `Non-root node '${node.id}' (type '${node.type}') has null parent_id`,
        details: { node_type: node.type },
      });
      continue;
    }
    if (!nodeIndex.has(node.parent_id)) {
      violations.push({
        type: 'orphan_node',
        node_id: node.id,
        message: `Node '${node.id}' references parent '${node.parent_id}' which does not exist in the graph`,
        details: { parent_id: node.parent_id, node_type: node.type },
      });
    }
  }

  // Rule 4: Parent-child type relationships must follow strict hierarchy
  for (const node of graph.nodes) {
    if (node.type === 'execution_root') continue;
    if (node.parent_id === null) continue;
    const parent = nodeIndex.get(node.parent_id);
    if (!parent) continue; // already reported as orphan
    const allowedChildren = VALID_GRAPH_CHILDREN.get(parent.type) ?? [];
    if (!allowedChildren.includes(node.type)) {
      violations.push({
        type: 'invalid_parent_child_type',
        node_id: node.id,
        message: `Node type '${node.type}' is not a valid child of parent type '${parent.type}'`,
        details: {
          parent_node_id: parent.id,
          parent_type: parent.type,
          child_type: node.type,
          allowed_children: [...allowedChildren],
        },
      });
    }
  }

  // Rule 5: Cycle detection + depth calculation
  const { maxDepth, cycles } = calculateDepthAndDetectCycles(graph.nodes, nodeIndex);
  for (const cycleNodeId of cycles) {
    violations.push({
      type: 'cycle_detected',
      node_id: cycleNodeId,
      message: `Cycle detected in parent chain involving node '${cycleNodeId}'`,
      details: {},
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    node_count: graph.nodes.length,
    max_depth: maxDepth,
  };
}

function calculateDepthAndDetectCycles(
  nodes: readonly GraphNode[],
  index: Map<string, GraphNode>,
): { maxDepth: number; cycles: string[] } {
  let maxDepth = 0;
  const cycles: string[] = [];

  for (const node of nodes) {
    let depth = 0;
    let current: GraphNode | undefined = node;
    const visited = new Set<string>();
    let hasCycle = false;

    while (current) {
      if (visited.has(current.id)) {
        hasCycle = true;
        break;
      }
      visited.add(current.id);
      depth++;
      if (current.parent_id === null) break;
      current = index.get(current.parent_id);
    }

    if (hasCycle) {
      cycles.push(node.id);
    } else if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return { maxDepth, cycles };
}
