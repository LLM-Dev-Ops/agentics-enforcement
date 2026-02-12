/**
 * ContractValidationAdapter — The primary enforcement domain service.
 * ADR-002 / DDD-003
 *
 * Orchestrates the two-phase enforcement pipeline:
 *   Phase 1: validateAgainstSchema() — structural validation via contracts
 *   Phase 2: applyEnforcementRules() — business rule evaluation via RuleEngine
 *
 * Invariants:
 *   - Schema validation ALWAYS runs first.
 *   - Rule evaluation ONLY runs if schema validation passes.
 *   - Domain events emitted at every decision point.
 *   - validateAgainstSchema() is independently callable (for meta-simulation).
 */
import { randomUUID } from 'node:crypto';
import type { ExecutionIntent } from '../contracts/index.js';
import type { SchemaValidationResult } from '../domain/schema-validation-result.js';
import type { RuleEvaluationResult } from '../domain/rule-evaluation-result.js';
import type { EnforcementResult } from '../domain/enforcement-result.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { BlockReason } from '../domain/block-reason.js';
import { createAllowed, createBlocked } from '../domain/enforcement-result.js';
import { SchemaRegistry } from './schema-registry.js';
import { RuleEngine } from './rule-engine.js';
import type { EventBus } from '../domain/events/event-bus.js';
import {
  createSchemaValidationPassed,
  createSchemaValidationFailed,
  createRuleEvaluationPassed,
  createRuleEvaluationDenied,
  createEnforcementDecisionMade,
} from '../domain/events/enforcement-events.js';

export class ContractValidationAdapter {
  private lastDecision: EnforcementDecision | null = null;

  constructor(
    private readonly schemaRegistry: SchemaRegistry,
    private readonly ruleEngine: RuleEngine,
    private readonly eventBus: EventBus,
  ) {}

  /**
   * Full two-phase enforcement pipeline.
   * Phase 1: schema validation. Phase 2: business rules.
   * Returns EnforcementResult (the external-facing value object).
   */
  enforceExecutionIntent(intent: unknown): EnforcementResult {
    const decisionId = randomUUID();
    const schemaVersion = this.schemaRegistry.getSchemaVersion();

    // --- Phase 1: Schema Validation (always runs) ---
    const schemaResult = this.validateAgainstSchema(intent);

    if (!schemaResult.passed) {
      const intentId = extractIntentId(intent);
      const blockReason: BlockReason = {
        phase: 'schema_validation',
        code: 'contract_schema_violation',
        message: `ExecutionIntent failed schema validation: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
        details: { errors: schemaResult.errors },
      };

      this.eventBus.emit(
        createSchemaValidationFailed(intentId, schemaVersion, schemaResult.errors),
      );

      const decision = this.buildDecision(
        decisionId, intentId, schemaVersion, schemaResult, null, 'blocked', blockReason,
      );
      this.lastDecision = decision;

      this.eventBus.emit(
        createEnforcementDecisionMade(decisionId, intentId, 'blocked'),
      );

      return createBlocked(intentId, decisionId, blockReason);
    }

    // Schema passed — intent is now typed
    const validIntent = intent as ExecutionIntent;
    const intentId = validIntent.id;

    this.eventBus.emit(
      createSchemaValidationPassed(intentId, schemaVersion),
    );

    // --- Phase 2: Business Rule Evaluation ---
    const ruleResult = this.applyEnforcementRules(validIntent);

    if (!ruleResult.passed) {
      const blockReason: BlockReason = {
        phase: 'rule_evaluation',
        code: 'enforcement_rule_violation',
        message: ruleResult.policy_decision.rationale,
        details: {
          failing_rule: ruleResult.failing_rule,
          rules_evaluated: ruleResult.rules_evaluated,
          rules_passed: ruleResult.rules_passed,
        },
      };

      this.eventBus.emit(
        createRuleEvaluationDenied(
          intentId,
          ruleResult.failing_rule ?? 'unknown',
          ruleResult.policy_decision.rationale,
        ),
      );

      const decision = this.buildDecision(
        decisionId, intentId, schemaVersion, schemaResult, ruleResult, 'blocked', blockReason,
      );
      this.lastDecision = decision;

      this.eventBus.emit(
        createEnforcementDecisionMade(decisionId, intentId, 'blocked'),
      );

      return createBlocked(intentId, decisionId, blockReason);
    }

    // --- Both phases passed ---
    this.eventBus.emit(
      createRuleEvaluationPassed(intentId, ruleResult.rules_evaluated),
    );

    const decision = this.buildDecision(
      decisionId, intentId, schemaVersion, schemaResult, ruleResult, 'allowed', null,
    );
    this.lastDecision = decision;

    this.eventBus.emit(
      createEnforcementDecisionMade(decisionId, intentId, 'allowed'),
    );

    return createAllowed(intentId, decisionId);
  }

  /**
   * Schema-only validation. Independently callable.
   * Used by CLI for meta-simulation gate (ADR-003).
   * Does NOT emit domain events or build decisions.
   */
  validateAgainstSchema(data: unknown): SchemaValidationResult {
    return this.schemaRegistry.validate('ExecutionIntent', data);
  }

  /**
   * Business rule evaluation. Called internally by enforceExecutionIntent
   * after schema passes.
   */
  applyEnforcementRules(intent: ExecutionIntent): RuleEvaluationResult {
    return this.ruleEngine.evaluate(intent);
  }

  /**
   * Returns the most recent EnforcementDecision aggregate (for testing/audit).
   */
  getLastDecision(): EnforcementDecision | null {
    return this.lastDecision;
  }

  private buildDecision(
    decisionId: string,
    intentId: string,
    schemaVersion: string,
    schemaValidation: SchemaValidationResult,
    ruleEvaluation: RuleEvaluationResult | null,
    outcome: 'allowed' | 'blocked',
    blockReason: BlockReason | null,
  ): EnforcementDecision {
    return {
      decision_id: decisionId,
      intent_id: intentId,
      schema_validation: schemaValidation,
      rule_evaluation: ruleEvaluation,
      outcome,
      block_reason: blockReason,
      span_emitted: false, // Span emission deferred to later phase
      evaluated_at: new Date().toISOString(),
      schema_version: schemaVersion,
    };
  }
}

/** Best-effort extraction of intent ID from unvalidated data. */
function extractIntentId(data: unknown): string {
  if (data && typeof data === 'object' && 'id' in data && typeof (data as any).id === 'string') {
    return (data as any).id;
  }
  return '(unknown)';
}
