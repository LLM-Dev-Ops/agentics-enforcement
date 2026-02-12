import { describe, it, expect, beforeEach } from 'vitest';
import { EnforcementGate } from '../enforcement-gate.js';
import { createEnforcementService } from '../../index.js';
import { EventBus } from '../../domain/events/event-bus.js';
import type { ExecutionIntent } from '../../contracts/index.js';
import type { EnforcementServicePort } from '../enforcement-gate.js';

function validIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    id: 'intent-1',
    caller: 'cli-user',
    action: 'simulate',
    target: 'security-core',
    parameters: {},
    metadata: {},
    is_meta_simulation: false,
    ...overrides,
  };
}

describe('EnforcementGate', () => {
  let gate: EnforcementGate;
  let enforcement: EnforcementServicePort;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    enforcement = createEnforcementService({ eventBus });
    gate = new EnforcementGate(enforcement);
  });

  describe('enterprise intent (is_meta_simulation = false)', () => {
    it('allows valid intent with allowlisted action', () => {
      const result = gate.evaluate(validIntent());
      expect(result.allowed).toBe(true);
      expect(result.decision.outcome).toBe('allowed');
      expect(result.decision.intent_id).toBe('intent-1');
    });

    it('decision has rule_evaluation populated', () => {
      const result = gate.evaluate(validIntent());
      expect(result.decision.rule_evaluation).not.toBeNull();
    });

    it('decision has schema_validation passed', () => {
      const result = gate.evaluate(validIntent());
      expect(result.decision.schema_validation.passed).toBe(true);
    });

    it('blocks intent with non-allowlisted action', () => {
      const result = gate.evaluate(validIntent({ action: 'destroy' }));
      expect(result.allowed).toBe(false);
      expect(result.decision.outcome).toBe('blocked');
      expect(result.decision.block_reason).not.toBeNull();
      expect(result.decision.block_reason!.phase).toBe('rule_evaluation');
    });

    it('carries the full EnforcementDecision from the enforcement service', () => {
      const result = gate.evaluate(validIntent());
      const lastDecision = enforcement.getLastDecision();
      expect(result.decision.decision_id).toBe(lastDecision!.decision_id);
    });

    it('returns the intent on the result', () => {
      const intent = validIntent({ id: 'intent-xyz' });
      const result = gate.evaluate(intent);
      expect(result.intent.id).toBe('intent-xyz');
    });
  });

  describe('meta-simulation (is_meta_simulation = true)', () => {
    it('allows valid intent even with non-allowlisted action', () => {
      const result = gate.evaluate(validIntent({
        is_meta_simulation: true,
        action: 'destroy',
      }));
      expect(result.allowed).toBe(true);
      expect(result.decision.outcome).toBe('allowed');
    });

    it('has rule_evaluation = null (rules skipped)', () => {
      const result = gate.evaluate(validIntent({
        is_meta_simulation: true,
        action: 'destroy',
      }));
      expect(result.decision.rule_evaluation).toBeNull();
    });

    it('has schema_validation passed', () => {
      const result = gate.evaluate(validIntent({ is_meta_simulation: true }));
      expect(result.decision.schema_validation.passed).toBe(true);
    });

    it('has a decision_id', () => {
      const result = gate.evaluate(validIntent({ is_meta_simulation: true }));
      expect(result.decision.decision_id).toBeTruthy();
    });

    it('has schema_version from enforcement service', () => {
      const result = gate.evaluate(validIntent({ is_meta_simulation: true }));
      expect(result.decision.schema_version).toBe(enforcement.getSchemaVersion());
    });

    it('same intent blocked by full enforcement but allowed by meta-sim', () => {
      const intent = validIntent({ action: 'destroy' });

      // Enterprise: blocked
      const enterprise = gate.evaluate({ ...intent, is_meta_simulation: false });
      expect(enterprise.allowed).toBe(false);

      // Meta-sim: allowed (rules skipped)
      const metaSim = gate.evaluate({ ...intent, is_meta_simulation: true });
      expect(metaSim.allowed).toBe(true);
    });
  });

  describe('fail-closed behavior', () => {
    it('blocks when enforcement service returns null decision', () => {
      // Create a stub that returns 'allowed' but getLastDecision returns null
      const stubEnforcement: EnforcementServicePort = {
        enforceExecutionIntent: () => ({
          outcome: 'allowed',
          intent_id: 'intent-1',
          block_reason: null,
          decision_id: 'fake-id',
        }),
        validateSchemaOnly: enforcement.validateSchemaOnly,
        getSchemaVersion: () => '0.1.0',
        getLastDecision: () => null, // Simulates an unexpected null decision
      };

      const failGate = new EnforcementGate(stubEnforcement);
      const result = failGate.evaluate(validIntent());

      expect(result.allowed).toBe(false);
      expect(result.decision.outcome).toBe('blocked');
      expect(result.decision.block_reason!.code).toBe('enforcement_unavailable');
    });
  });
});
