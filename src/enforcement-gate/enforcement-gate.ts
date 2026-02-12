/**
 * EnforcementGate — Domain service implementing ADR-003 CLI Enforcement Gate.
 * DDD-003 / ADR-003
 *
 * Encapsulates the decision of whether to run schema-only validation
 * (meta-simulation) or full enforcement (enterprise execution).
 *
 * Invariants:
 *   - Meta simulations (is_meta_simulation === true) call validateSchemaOnly() ONLY.
 *   - Enterprise intents call enforceExecutionIntent() and MUST receive 'allowed'.
 *   - Fail-closed: any failure results in GateResult.allowed === false.
 *   - Every GateResult carries a full EnforcementDecision for audit attachment.
 */
import { randomUUID } from 'node:crypto';
import type { ExecutionIntent } from '../contracts/index.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';
import type { EnforcementOutcome } from '../domain/enforcement-outcome.js';
import type { SchemaValidationResult } from '../domain/schema-validation-result.js';
import type { EnforcementResult } from '../domain/enforcement-result.js';
import type { BlockReason } from '../domain/block-reason.js';
import type { GateResult } from './gate-result.js';

/**
 * Minimal port interface for the enforcement service.
 * Defined locally to avoid circular imports with src/index.ts.
 */
export interface EnforcementServicePort {
  enforceExecutionIntent(intent: unknown): EnforcementResult;
  validateSchemaOnly(data: unknown): SchemaValidationResult;
  getSchemaVersion(): string;
  getLastDecision(): EnforcementDecision | null;
}

export class EnforcementGate {
  constructor(
    private readonly enforcement: EnforcementServicePort,
  ) {}

  evaluate(intent: ExecutionIntent): GateResult {
    if (intent.is_meta_simulation) {
      return this.evaluateMetaSimulation(intent);
    }
    return this.evaluateEnterprise(intent);
  }

  private evaluateMetaSimulation(intent: ExecutionIntent): GateResult {
    const schemaResult = this.enforcement.validateSchemaOnly(intent);

    if (!schemaResult.passed) {
      const blockReason: BlockReason = {
        phase: 'schema_validation',
        code: 'contract_schema_violation',
        message: `Meta-simulation intent failed schema validation: ${schemaResult.errors.map((e) => e.message).join('; ')}`,
        details: { errors: schemaResult.errors },
      };
      const decision = this.buildMetaSimDecision(
        intent.id, schemaResult, 'blocked', blockReason,
      );
      return { allowed: false, decision, intent };
    }

    const decision = this.buildMetaSimDecision(
      intent.id, schemaResult, 'allowed', null,
    );
    return { allowed: true, decision, intent };
  }

  private evaluateEnterprise(intent: ExecutionIntent): GateResult {
    const result = this.enforcement.enforceExecutionIntent(intent);
    const decision = this.enforcement.getLastDecision();

    if (result.outcome === 'blocked' || !decision) {
      // Fail closed: if decision is somehow null, treat as blocked
      const fallbackDecision = decision ?? this.buildFailClosedDecision(intent.id);
      return { allowed: false, decision: fallbackDecision, intent };
    }

    return { allowed: true, decision, intent };
  }

  private buildMetaSimDecision(
    intentId: string,
    schemaResult: SchemaValidationResult,
    outcome: EnforcementOutcome,
    blockReason: BlockReason | null,
  ): EnforcementDecision {
    return {
      decision_id: randomUUID(),
      intent_id: intentId,
      schema_validation: schemaResult,
      rule_evaluation: null, // Meta-sim: rules are intentionally skipped
      outcome,
      block_reason: blockReason,
      span_emitted: false,
      evaluated_at: new Date().toISOString(),
      schema_version: this.enforcement.getSchemaVersion(),
    };
  }

  private buildFailClosedDecision(intentId: string): EnforcementDecision {
    return {
      decision_id: randomUUID(),
      intent_id: intentId,
      schema_validation: {
        passed: false,
        schema_name: 'ExecutionIntent',
        schema_version: this.enforcement.getSchemaVersion(),
        errors: [{
          field: '(internal)',
          expected: 'decision',
          actual: 'null',
          message: 'Enforcement produced no decision — fail closed',
        }],
      },
      rule_evaluation: null,
      outcome: 'blocked',
      block_reason: {
        phase: 'schema_validation',
        code: 'enforcement_unavailable',
        message: 'Enforcement service produced no decision. Failing closed per ADR-003.',
        details: {},
      },
      span_emitted: false,
      evaluated_at: new Date().toISOString(),
      schema_version: this.enforcement.getSchemaVersion(),
    };
  }
}
