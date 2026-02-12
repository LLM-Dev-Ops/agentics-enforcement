/**
 * EnforcementDecision — Aggregate Root.
 * DDD-003: Represents a single enforcement evaluation.
 *
 * Invariants:
 *   - schema_validation is ALWAYS populated.
 *   - rule_evaluation is populated ONLY if schema_validation.passed === true.
 *   - outcome is "blocked" if either phase fails; "allowed" only if both pass.
 *   - span_emitted must be true before the decision is returned to caller.
 *   - schema_version records which contract schema version was used.
 */
import type { EnforcementOutcome } from './enforcement-outcome.js';
import type { SchemaValidationResult } from './schema-validation-result.js';
import type { RuleEvaluationResult } from './rule-evaluation-result.js';
import type { BlockReason } from './block-reason.js';

export interface EnforcementDecision {
  decision_id: string;
  intent_id: string;
  schema_validation: SchemaValidationResult;
  rule_evaluation: RuleEvaluationResult | null;
  outcome: EnforcementOutcome;
  block_reason: BlockReason | null;
  span_emitted: boolean;
  evaluated_at: string;
  schema_version: string;
}
