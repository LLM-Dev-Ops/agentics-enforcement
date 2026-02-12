import { describe, it, expect, beforeEach } from 'vitest';
import { ContractValidationAdapter } from '../contract-validation-adapter.js';
import { SchemaRegistry } from '../schema-registry.js';
import { RuleEngine } from '../rule-engine.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import { createIntentCompletenessRule } from '../../rules/intent-completeness-rule.js';
import { createActionAllowlistRule } from '../../rules/action-allowlist-rule.js';
import type { ExecutionIntent } from '../../contracts/index.js';

function validIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    id: 'intent-1', caller: 'cli-user', action: 'simulate', target: 'security-core',
    parameters: {}, metadata: {}, is_meta_simulation: false,
    ...overrides,
  };
}

describe('ContractValidationAdapter', () => {
  let adapter: ContractValidationAdapter;
  let eventBus: EventBus;
  let events: DomainEvent[];

  beforeEach(() => {
    eventBus = new EventBus();
    events = [];
    eventBus.subscribe('SchemaValidationPassed', (e) => events.push(e));
    eventBus.subscribe('SchemaValidationFailed', (e) => events.push(e));
    eventBus.subscribe('RuleEvaluationPassed', (e) => events.push(e));
    eventBus.subscribe('RuleEvaluationDenied', (e) => events.push(e));
    eventBus.subscribe('EnforcementDecisionMade', (e) => events.push(e));

    const registry = new SchemaRegistry();
    const ruleEngine = new RuleEngine();
    ruleEngine.addRule(createIntentCompletenessRule());
    ruleEngine.addRule(createActionAllowlistRule());
    adapter = new ContractValidationAdapter(registry, ruleEngine, eventBus);
  });

  // -------------------------------------------------------------------
  // Schema passes + rules pass → ALLOWED
  // -------------------------------------------------------------------

  describe('when schema passes and rules pass', () => {
    it('returns outcome=allowed', () => {
      const r = adapter.enforceExecutionIntent(validIntent());
      expect(r.outcome).toBe('allowed');
      expect(r.intent_id).toBe('intent-1');
      expect(r.block_reason).toBeNull();
    });

    it('emits SchemaValidationPassed, RuleEvaluationPassed, EnforcementDecisionMade', () => {
      adapter.enforceExecutionIntent(validIntent());
      const types = events.map((e) => e.type);
      expect(types).toEqual([
        'SchemaValidationPassed',
        'RuleEvaluationPassed',
        'EnforcementDecisionMade',
      ]);
    });

    it('builds an EnforcementDecision aggregate with both phases populated', () => {
      adapter.enforceExecutionIntent(validIntent());
      const dec = adapter.getLastDecision();
      expect(dec).not.toBeNull();
      expect(dec!.outcome).toBe('allowed');
      expect(dec!.schema_validation.passed).toBe(true);
      expect(dec!.rule_evaluation).not.toBeNull();
      expect(dec!.rule_evaluation!.passed).toBe(true);
      expect(dec!.block_reason).toBeNull();
      expect(dec!.schema_version).toBe('0.1.0');
    });
  });

  // -------------------------------------------------------------------
  // Schema fails → BLOCKED (phase: schema_validation)
  // -------------------------------------------------------------------

  describe('when schema validation fails', () => {
    it('returns outcome=blocked with phase=schema_validation', () => {
      const r = adapter.enforceExecutionIntent({ bad: 'data' });
      expect(r.outcome).toBe('blocked');
      expect(r.block_reason!.phase).toBe('schema_validation');
      expect(r.block_reason!.code).toBe('contract_schema_violation');
    });

    it('does NOT evaluate rules', () => {
      adapter.enforceExecutionIntent({ bad: 'data' });
      const dec = adapter.getLastDecision();
      expect(dec!.rule_evaluation).toBeNull();
    });

    it('emits SchemaValidationFailed, EnforcementDecisionMade (no rule events)', () => {
      adapter.enforceExecutionIntent({ bad: 'data' });
      const types = events.map((e) => e.type);
      expect(types).toEqual([
        'SchemaValidationFailed',
        'EnforcementDecisionMade',
      ]);
    });

    it('block_reason details contain schema errors', () => {
      const r = adapter.enforceExecutionIntent({});
      expect(r.block_reason!.details.errors).toBeDefined();
      expect(Array.isArray(r.block_reason!.details.errors)).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // Schema passes + rules deny → BLOCKED (phase: rule_evaluation)
  // -------------------------------------------------------------------

  describe('when schema passes but rules deny', () => {
    it('returns outcome=blocked with phase=rule_evaluation', () => {
      const r = adapter.enforceExecutionIntent(validIntent({ action: 'destroy' }));
      expect(r.outcome).toBe('blocked');
      expect(r.block_reason!.phase).toBe('rule_evaluation');
      expect(r.block_reason!.code).toBe('enforcement_rule_violation');
    });

    it('emits SchemaValidationPassed, RuleEvaluationDenied, EnforcementDecisionMade', () => {
      adapter.enforceExecutionIntent(validIntent({ action: 'destroy' }));
      const types = events.map((e) => e.type);
      expect(types).toEqual([
        'SchemaValidationPassed',
        'RuleEvaluationDenied',
        'EnforcementDecisionMade',
      ]);
    });

    it('block_reason details contain failing rule info', () => {
      const r = adapter.enforceExecutionIntent(validIntent({ action: 'destroy' }));
      expect(r.block_reason!.details.failing_rule).toBe('builtin:action-allowlist');
    });

    it('builds decision with both phases populated, rule_evaluation.passed=false', () => {
      adapter.enforceExecutionIntent(validIntent({ action: 'destroy' }));
      const dec = adapter.getLastDecision();
      expect(dec!.schema_validation.passed).toBe(true);
      expect(dec!.rule_evaluation!.passed).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // validateAgainstSchema() is independently callable
  // -------------------------------------------------------------------

  describe('validateAgainstSchema (independent)', () => {
    it('returns passed for valid data', () => {
      const r = adapter.validateAgainstSchema(validIntent());
      expect(r.passed).toBe(true);
    });

    it('returns failed for invalid data', () => {
      const r = adapter.validateAgainstSchema({});
      expect(r.passed).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('does NOT emit domain events when called directly', () => {
      adapter.validateAgainstSchema(validIntent());
      expect(events).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // Decision ID uniqueness
  // -------------------------------------------------------------------

  it('generates unique decision IDs for consecutive calls', () => {
    const r1 = adapter.enforceExecutionIntent(validIntent());
    const r2 = adapter.enforceExecutionIntent(validIntent({ id: 'intent-2' }));
    expect(r1.decision_id).not.toBe(r2.decision_id);
  });
});
