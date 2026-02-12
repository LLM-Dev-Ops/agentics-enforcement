import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEnforcementService,
  EventBus,
  type DomainEvent,
  type EnforcementService,
  type EnforcementRule,
  type ExecutionIntent,
} from '../index.js';

function validIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    id: 'intent-1', caller: 'cli-user', action: 'simulate', target: 'security-core',
    parameters: { depth: 3 }, metadata: { source: 'test' }, is_meta_simulation: false,
    ...overrides,
  };
}

describe('Integration: EnforcementService', () => {
  let service: EnforcementService;
  let eventBus: EventBus;
  let events: DomainEvent[];

  beforeEach(() => {
    eventBus = new EventBus();
    events = [];
    // Capture all events
    for (const type of [
      'SchemaValidationPassed', 'SchemaValidationFailed',
      'RuleEvaluationPassed', 'RuleEvaluationDenied',
      'EnforcementDecisionMade',
    ]) {
      eventBus.subscribe(type, (e) => events.push(e));
    }
    service = createEnforcementService({ eventBus });
  });

  // -------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------

  it('allows a valid execution intent', () => {
    const r = service.enforceExecutionIntent(validIntent());
    expect(r.outcome).toBe('allowed');
    expect(r.intent_id).toBe('intent-1');
    expect(r.block_reason).toBeNull();
    expect(r.decision_id).toBeTruthy();
  });

  it('emits correct events on success', () => {
    service.enforceExecutionIntent(validIntent());
    expect(events.map((e) => e.type)).toEqual([
      'SchemaValidationPassed',
      'RuleEvaluationPassed',
      'EnforcementDecisionMade',
    ]);
    expect(events[2].payload.outcome).toBe('allowed');
  });

  // -------------------------------------------------------------------
  // Schema failure
  // -------------------------------------------------------------------

  it('blocks intent with missing required fields (schema fail)', () => {
    const r = service.enforceExecutionIntent({ id: 'x' }); // missing caller, action, target
    expect(r.outcome).toBe('blocked');
    expect(r.block_reason!.phase).toBe('schema_validation');
  });

  it('blocks completely invalid data', () => {
    const r = service.enforceExecutionIntent('not-an-object');
    expect(r.outcome).toBe('blocked');
    expect(r.block_reason!.phase).toBe('schema_validation');
  });

  // -------------------------------------------------------------------
  // Rule failure
  // -------------------------------------------------------------------

  it('blocks intent with invalid action (rule fail)', () => {
    const r = service.enforceExecutionIntent(validIntent({ action: 'destroy' }));
    expect(r.outcome).toBe('blocked');
    expect(r.block_reason!.phase).toBe('rule_evaluation');
    expect(r.block_reason!.details.failing_rule).toBe('builtin:action-allowlist');
  });

  // -------------------------------------------------------------------
  // validateSchemaOnly (meta-simulation support)
  // -------------------------------------------------------------------

  it('validateSchemaOnly passes for valid intent', () => {
    const r = service.validateSchemaOnly(validIntent());
    expect(r.passed).toBe(true);
    expect(r.schema_name).toBe('ExecutionIntent');
  });

  it('validateSchemaOnly fails for invalid data', () => {
    const r = service.validateSchemaOnly({});
    expect(r.passed).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('validateSchemaOnly does NOT emit events', () => {
    service.validateSchemaOnly(validIntent());
    expect(events).toHaveLength(0);
  });

  it('meta-simulation scenario: schema-only validation allows structurally valid intent', () => {
    const intent = validIntent({ is_meta_simulation: true, action: 'destroy' });
    // Schema validates fine (action is a valid string)
    const schemaResult = service.validateSchemaOnly(intent);
    expect(schemaResult.passed).toBe(true);
    // Full enforcement would block it (action not in allowlist)
    const fullResult = service.enforceExecutionIntent(intent);
    expect(fullResult.outcome).toBe('blocked');
    expect(fullResult.block_reason!.phase).toBe('rule_evaluation');
  });

  // -------------------------------------------------------------------
  // Custom rules
  // -------------------------------------------------------------------

  it('addRule adds a custom rule that fires', () => {
    const customRule: EnforcementRule = {
      rule_id: 'custom:block-all', name: 'Block All', description: 'test',
      priority: 50, enabled: true,
      evaluate: () => ({ passed: false, rule_id: 'custom:block-all', reason: 'blocked by custom rule' }),
    };
    service.addRule(customRule);

    const r = service.enforceExecutionIntent(validIntent());
    expect(r.outcome).toBe('blocked');
    expect(r.block_reason!.details.failing_rule).toBe('custom:block-all');
  });

  it('removeRule removes a built-in rule', () => {
    // Remove action-allowlist rule
    expect(service.removeRule('builtin:action-allowlist')).toBe(true);
    // Now "destroy" action should pass (only completeness rule remains)
    const r = service.enforceExecutionIntent(validIntent({ action: 'destroy' }));
    expect(r.outcome).toBe('allowed');
  });

  // -------------------------------------------------------------------
  // getSchemaVersion
  // -------------------------------------------------------------------

  it('getSchemaVersion returns 0.1.0', () => {
    expect(service.getSchemaVersion()).toBe('0.1.0');
  });

  // -------------------------------------------------------------------
  // Aggregate inspection
  // -------------------------------------------------------------------

  it('getLastDecision returns the most recent decision aggregate', () => {
    service.enforceExecutionIntent(validIntent());
    const dec = service.getLastDecision();
    expect(dec).not.toBeNull();
    expect(dec!.outcome).toBe('allowed');
    expect(dec!.schema_validation.passed).toBe(true);
    expect(dec!.rule_evaluation!.passed).toBe(true);
    expect(dec!.block_reason).toBeNull();
    expect(dec!.schema_version).toBe('0.1.0');
    expect(dec!.evaluated_at).toBeTruthy();
  });

  it('getLastDecision reflects the most recent call', () => {
    service.enforceExecutionIntent(validIntent());
    service.enforceExecutionIntent(validIntent({ action: 'destroy' }));
    const dec = service.getLastDecision();
    expect(dec!.outcome).toBe('blocked');
  });

  // -------------------------------------------------------------------
  // skipBuiltInRules config
  // -------------------------------------------------------------------

  it('skipBuiltInRules disables built-in rules', () => {
    const bare = createEnforcementService({ skipBuiltInRules: true });
    // "destroy" would normally be blocked by action-allowlist
    const r = bare.enforceExecutionIntent(validIntent({ action: 'destroy' }));
    expect(r.outcome).toBe('allowed');
  });
});
