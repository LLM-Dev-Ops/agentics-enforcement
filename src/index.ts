/**
 * @agentics/enforcement — public API surface
 *
 * Contract schemas re-exported from src/contracts/ (ADR-001).
 * Enforcement domain types and factory from src/domain/ + src/services/ (ADR-002, DDD-003).
 */

// ── Contract schemas (Published Language from Contract Context) ──────────
export {
  CONTRACTS_VERSION,
  CANONICAL_SCHEMA_NAMES,
  ExecutionIntentSchema,
  ExecutionGraphSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  CoreExecutionResultSchema,
  EvidenceSummarySchema,
  EvidenceEntrySchema,
  PolicyDecisionSchema,
  CostReferenceSchema,
  NodeType,
  ResultStatus,
  type ExecutionIntent,
  type ExecutionGraph,
  type GraphNode,
  type GraphEdge,
  type CoreExecutionResult,
  type EvidenceSummary,
  type EvidenceEntry,
  type PolicyDecision,
  type CostReference,
} from './contracts/index.js';

// ── Enforcement domain types ─────────────────────────────────────────────
export type { EnforcementOutcome } from './domain/enforcement-outcome.js';
export type { SchemaError, SchemaValidationResult } from './domain/schema-validation-result.js';
export type { BlockPhase, BlockReason } from './domain/block-reason.js';
export type { RuleEvaluationResult } from './domain/rule-evaluation-result.js';
export type { EnforcementResult } from './domain/enforcement-result.js';
export type { EnforcementRule, RuleResult } from './domain/enforcement-rule.js';
export type { EnforcementDecision } from './domain/enforcement-decision.js';

// ── Domain events ────────────────────────────────────────────────────────
export { EventBus, type DomainEvent, type EventHandler } from './domain/events/event-bus.js';

// ── Built-in rules (for consumers who want to compose their own engine) ──
export { createIntentCompletenessRule } from './rules/intent-completeness-rule.js';
export { createActionAllowlistRule } from './rules/action-allowlist-rule.js';

// ── Enforcement service factory ──────────────────────────────────────────
import { SchemaRegistry } from './services/schema-registry.js';
import { RuleEngine } from './services/rule-engine.js';
import { ContractValidationAdapter } from './services/contract-validation-adapter.js';
import { EventBus } from './domain/events/event-bus.js';
import { createIntentCompletenessRule } from './rules/intent-completeness-rule.js';
import { createActionAllowlistRule } from './rules/action-allowlist-rule.js';
import type { EnforcementResult } from './domain/enforcement-result.js';
import type { SchemaValidationResult } from './domain/schema-validation-result.js';
import type { EnforcementRule } from './domain/enforcement-rule.js';
import type { EnforcementDecision } from './domain/enforcement-decision.js';

export interface EnforcementConfig {
  /** Custom event bus (default: new EventBus()) */
  eventBus?: EventBus;
  /** Additional rules beyond built-ins */
  additionalRules?: EnforcementRule[];
  /** Skip built-in rules (default: false) */
  skipBuiltInRules?: boolean;
}

export interface EnforcementService {
  enforceExecutionIntent(intent: unknown): EnforcementResult;
  validateSchemaOnly(data: unknown): SchemaValidationResult;
  getSchemaVersion(): string;
  addRule(rule: EnforcementRule): void;
  removeRule(ruleId: string): boolean;
  getLastDecision(): EnforcementDecision | null;
}

// ── Execution domain (DDD-002, ADR-004) ─────────────────────────────────
export type {
  ExecutionId,
  ExecutionStatus,
  RootSpanMeta,
  AcceptanceResponse,
  RejectionResponse,
  AcceptResult,
  Execution,
  ExecutionRepository,
} from './execution/index.js';
export {
  executionIdEquals,
  canTransition,
  InvalidTransitionError,
  transitionExecution,
  createExecutionAccepted,
  createExecutionRejected,
  InMemoryExecutionRepository,
  ExecutionAcceptanceService,
} from './execution/index.js';

// ── Enforcement gate (ADR-003) ──────────────────────────────────────────
export { EnforcementGate, type EnforcementServicePort } from './enforcement-gate/index.js';
export type { GateResult } from './enforcement-gate/index.js';

// ── Ruvector HTTP handler (ADR-004) ─────────────────────────────────────
export {
  AcceptHandler,
  type HandlerRequest,
  type HandlerResponse,
  type EnforcementBlockedResponse,
} from './ruvector/index.js';

export function createEnforcementService(config: EnforcementConfig = {}): EnforcementService {
  const eventBus = config.eventBus ?? new EventBus();
  const schemaRegistry = new SchemaRegistry();
  const ruleEngine = new RuleEngine();

  if (!config.skipBuiltInRules) {
    ruleEngine.addRule(createIntentCompletenessRule());
    ruleEngine.addRule(createActionAllowlistRule());
  }

  if (config.additionalRules) {
    for (const rule of config.additionalRules) {
      ruleEngine.addRule(rule);
    }
  }

  const adapter = new ContractValidationAdapter(schemaRegistry, ruleEngine, eventBus);

  return {
    enforceExecutionIntent: (intent) => adapter.enforceExecutionIntent(intent),
    validateSchemaOnly: (data) => adapter.validateAgainstSchema(data),
    getSchemaVersion: () => schemaRegistry.getSchemaVersion(),
    addRule: (rule) => ruleEngine.addRule(rule),
    removeRule: (ruleId) => ruleEngine.removeRule(ruleId),
    getLastDecision: () => adapter.getLastDecision(),
  };
}

// ── Observability domain (DDD-005) ──────────────────────────────────────
export type {
  SpanType,
  SpanStatus,
  Span,
  CreateSpanParams,
  SpanAttributes,
  ExecutionRootAttributes,
  ContractValidationAttributes,
  CoreAttributes,
  RepoAttributes,
  AgentAttributes,
  TreeStatus,
  SpanTree,
  ViolationType,
  TreeViolation,
  TreeValidationResult,
} from './observability/index.js';
export {
  SPAN_TYPES,
  isValidSpanType,
  VALID_CHILD_TYPES,
  canCloseSpan,
  InvalidSpanTransitionError,
  createSpan,
  closeSpan,
  createSpanTree,
  addSpanToTree,
  completeSpanTree,
  markSpanTreeBroken,
  SpanFactory,
  validateSpanTree,
  createSpanCreatedEvent,
  createSpanClosedEvent,
  createSpanTreeCompletedEvent,
  createSpanTreeBrokenEvent,
} from './observability/index.js';

// ── Simulation engine (ADR-005) ─────────────────────────────────────────
export type {
  CoreDelegate,
  CoreResolver,
  CoreStep,
  DispatchResult,
  DispatchOutcome,
  CoreName,
  RepoName,
  RepoViolation,
  HierarchyViolationType,
  HierarchyViolation,
  GraphHierarchyValidationResult,
} from './simulation-engine/index.js';
export {
  InMemoryStubDelegate,
  MapCoreResolver,
  extractCoreSteps,
  GraphCycleError,
  determineOutcome,
  createDispatchResult,
  SimulationEngine,
  UnresolvedCoreError,
  RepoAssignmentViolationError,
  GraphHierarchyViolationError,
  validateGraphHierarchy,
  CORE_NAMES,
  REPO_NAMES,
  CORE_REPO_ASSIGNMENTS,
  isRepoAssignedToCore,
  getAssignedRepos,
  getAssignedCore,
  validateRepoAssignments,
  createDispatchStartedEvent,
  createCoreDelegationStartedEvent,
  createCoreDelegationCompletedEvent,
  createDispatchCompletedEvent,
  createDispatchFailedEvent,
} from './simulation-engine/index.js';

// ── Cost domain (DDD-004, ADR-007) ──────────────────────────────────────
export type {
  CostParameters,
  ComputationStatus,
  CostComputation,
  CostDetail,
  CostComputationRepository,
} from './cost/index.js';
export {
  CostComputationService,
  CostReferenceNotFoundError,
  InvalidComputationTransitionError,
  InMemoryCostComputationRepository,
  createCostComputationCompletedEvent,
  createCostReferenceResolvedEvent,
} from './cost/index.js';
// NOTE: RawCostValue deliberately NOT exported — internal to CostOps only (ADR-007)
