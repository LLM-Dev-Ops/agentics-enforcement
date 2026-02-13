/**
 * Graph walker — Extracts core steps from an ExecutionGraph in topological order.
 * ADR-005: The simulation engine walks the execution graph to determine delegation order.
 *
 * Uses Kahn's algorithm for deterministic topological sort on core-level edges.
 *
 * NO non-null assertions (!!). All lookups are validated explicitly.
 * Missing graph identifiers → throw.
 */
import type { ExecutionGraph, GraphNode } from '../contracts/index.js';

export interface CoreStep {
  readonly coreName: string;
  readonly coreNodeId: string;
  readonly childNodes: readonly GraphNode[];
}

export class GraphCycleError extends Error {
  override readonly name = 'GraphCycleError';
  constructor(coreNames: string[]) {
    super(`Cycle detected among core nodes: ${coreNames.join(', ')}`);
  }
}

export class MissingGraphNodeError extends Error {
  override readonly name = 'MissingGraphNodeError';
  constructor(
    public readonly nodeId: string,
    public readonly context: string,
  ) {
    super(`Graph node '${nodeId}' not found: ${context}`);
  }
}

/**
 * Extract core nodes from the graph and return them in topological dependency order.
 * Non-core nodes (repo, agent) are collected as children of their parent core.
 */
export function extractCoreSteps(graph: ExecutionGraph): CoreStep[] {
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // 1. Identify core nodes
  const coreNodes = graph.nodes.filter((n) => n.type === 'core');
  if (coreNodes.length === 0) {
    return [];
  }

  const coreIds = new Set(coreNodes.map((n) => n.id));

  // 2. Collect child nodes for each core (repo, agent nodes whose parent_id chains up to a core)
  const coreChildren = new Map<string, GraphNode[]>();
  for (const core of coreNodes) {
    coreChildren.set(core.id, []);
  }

  for (const node of graph.nodes) {
    if (node.type === 'core' || node.type === 'execution_root') continue;
    // Walk up parent chain to find owning core
    const owningCore = findOwningCore(node, nodeMap, coreIds);
    if (owningCore) {
      const children = coreChildren.get(owningCore);
      if (!children) {
        throw new MissingGraphNodeError(owningCore, 'core children list missing during graph walk');
      }
      children.push(node);
    }
  }

  // 3. Build adjacency and in-degree for core-level edges only
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const core of coreNodes) {
    adjacency.set(core.id, []);
    inDegree.set(core.id, 0);
  }

  for (const edge of graph.edges) {
    if (coreIds.has(edge.from) && coreIds.has(edge.to)) {
      const adj = adjacency.get(edge.from);
      if (!adj) {
        throw new MissingGraphNodeError(edge.from, 'adjacency list missing for core edge source');
      }
      adj.push(edge.to);
      const currentDeg = inDegree.get(edge.to) ?? 0;
      inDegree.set(edge.to, currentDeg + 1);
    }
  }

  // 4. Kahn's topological sort
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    sorted.push(current);
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      const currentDeg = inDegree.get(neighbor);
      if (currentDeg === undefined) {
        throw new MissingGraphNodeError(neighbor, 'in-degree missing during topological sort');
      }
      const newDeg = currentDeg - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== coreNodes.length) {
    const unsorted = coreNodes
      .filter((n) => !sorted.includes(n.id))
      .map((n) => n.name);
    throw new GraphCycleError(unsorted);
  }

  // 5. Build CoreStep[] in sorted order
  return sorted.map((coreId) => {
    const coreNode = nodeMap.get(coreId);
    if (!coreNode) {
      throw new MissingGraphNodeError(coreId, 'core node missing during step construction');
    }
    return {
      coreName: coreNode.name,
      coreNodeId: coreNode.id,
      childNodes: coreChildren.get(coreId) ?? [],
    };
  });
}

function findOwningCore(
  node: GraphNode,
  nodeMap: Map<string, GraphNode>,
  coreIds: Set<string>,
): string | null {
  let current = node;
  const visited = new Set<string>();
  while (current.parent_id !== null) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    if (coreIds.has(current.parent_id)) return current.parent_id;
    const parent = nodeMap.get(current.parent_id);
    if (!parent) return null;
    current = parent;
  }
  return null;
}
