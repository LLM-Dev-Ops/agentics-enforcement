/**
 * @agentics/contracts — Re-export shim.
 *
 * ALL schemas are imported from the @agentics/contracts package (ADR-001).
 * This module MUST NOT define schemas locally.
 * Execution-engine must NOT maintain its own schema copies.
 *
 * RULES (ADR-001):
 *   1. Every schema consumed by this repo comes from @agentics/contracts.
 *   2. Local Zod definitions of canonical schemas are FORBIDDEN.
 *   3. All consumers import from this barrel.
 *   4. Schema changes follow semver in the contracts package.
 */

// ── Canonical schemas from @agentics/contracts ──────────────────────────

export {
  CONTRACTS_VERSION,
  CANONICAL_SCHEMA_NAMES,

  // #1 ExecutionIntent
  ExecutionIntentSchema,
  type ExecutionIntent,

  // #2 ExecutionGraph
  ExecutionGraphSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  NodeType,
  type ExecutionGraph,
  type GraphNode,
  type GraphEdge,

  // #3 CoreExecutionResult
  CoreExecutionResultSchema,
  ResultStatus,
  type CoreExecutionResult,

  // #4 EvidenceSummary
  EvidenceSummarySchema,
  EvidenceEntrySchema,
  type EvidenceSummary,
  type EvidenceEntry,

  // #5 PolicyDecision
  PolicyDecisionSchema,
  type PolicyDecision,

  // #6 CostReference
  CostReferenceSchema,
  type CostReference,

  // #7 ExecutionContext (strict context propagation)
  ExecutionContextSchema,
  type ExecutionContext,

  // #8 ResultPacket (results-index write payload)
  ResultPacketSchema,
  type ResultPacket,
} from '@agentics/contracts';
