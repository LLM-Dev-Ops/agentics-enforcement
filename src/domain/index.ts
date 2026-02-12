/**
 * Enforcement domain — barrel export.
 * All value objects, entities, and aggregate root types.
 */
export type { EnforcementOutcome } from './enforcement-outcome.js';

export type { SchemaError, SchemaValidationResult } from './schema-validation-result.js';
export { createPassedResult, createFailedResult } from './schema-validation-result.js';

export type { BlockPhase, BlockReason } from './block-reason.js';

export type { RuleEvaluationResult } from './rule-evaluation-result.js';

export type { EnforcementResult } from './enforcement-result.js';
export { createAllowed, createBlocked } from './enforcement-result.js';

export type { RuleResult, EnforcementRule } from './enforcement-rule.js';

export type { EnforcementDecision } from './enforcement-decision.js';

export * from './events/index.js';
