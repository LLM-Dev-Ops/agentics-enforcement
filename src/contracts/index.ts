/**
 * @agentics/contracts — Canonical schema barrel export.
 *
 * This module is the CONTRACT CONTEXT (DDD-001). It defines the 6 canonical
 * schemas that all other bounded contexts consume via Published Language.
 *
 * RULES (ADR-001):
 *   1. This module has ZERO imports from outside src/contracts/.
 *   2. These schemas MUST NOT be redefined in any other module.
 *   3. All consumers MUST import from this barrel.
 *   4. Schema changes follow semver.
 *
 * When @agentics/contracts is extracted to its own package, this barrel
 * becomes a re-export shim pointing to the external package.
 */

/** Schema version — tracks the contract version for audit purposes */
export const CONTRACTS_VERSION = '0.1.0';

/** Canonical schema names — used by CI hooks to detect duplication */
export const CANONICAL_SCHEMA_NAMES = [
  'ExecutionIntent',
  'ExecutionGraph',
  'CoreExecutionResult',
  'EvidenceSummary',
  'PolicyDecision',
  'CostReference',
] as const;

// #1 ExecutionIntent
export {
  ExecutionIntentSchema,
  type ExecutionIntent,
} from './execution-intent.js';

// #2 ExecutionGraph
export {
  ExecutionGraphSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  NodeType,
  type ExecutionGraph,
  type GraphNode,
  type GraphEdge,
} from './execution-graph.js';

// #3 CoreExecutionResult
export {
  CoreExecutionResultSchema,
  ResultStatus,
  type CoreExecutionResult,
} from './core-execution-result.js';

// #4 EvidenceSummary
export {
  EvidenceSummarySchema,
  EvidenceEntrySchema,
  type EvidenceSummary,
  type EvidenceEntry,
} from './evidence-summary.js';

// #5 PolicyDecision
export {
  PolicyDecisionSchema,
  type PolicyDecision,
} from './policy-decision.js';

// #6 CostReference
export {
  CostReferenceSchema,
  type CostReference,
} from './cost-reference.js';
