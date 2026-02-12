/**
 * ExecutionGraph — DAG of execution steps with hierarchy constraints.
 *
 * Canonical schema #2 of 6. Defined in the Contract Context (ADR-001).
 * This file MUST have zero imports from outside src/contracts/.
 */
import { z } from 'zod';

export const NodeType = z.enum(['execution_root', 'core', 'repo', 'agent']);
export type NodeType = z.infer<typeof NodeType>;

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeType,
  name: z.string().min(1),
  parent_id: z.string().nullable(),
  children_ids: z.array(z.string()),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const ExecutionGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  validated: z.boolean().default(false),
});
export type ExecutionGraph = z.infer<typeof ExecutionGraphSchema>;
