import { describe, it, expect } from 'vitest';
import {
  createSchemaValidationPassed,
  createSchemaValidationFailed,
  createRuleEvaluationPassed,
  createRuleEvaluationDenied,
  createEnforcementDecisionMade,
} from '../enforcement-events.js';

describe('Enforcement event creators', () => {
  it('SchemaValidationPassed has correct type and payload', () => {
    const e = createSchemaValidationPassed('intent-1', '0.1.0');
    expect(e.type).toBe('SchemaValidationPassed');
    expect(e.payload.intent_id).toBe('intent-1');
    expect(e.payload.schema_version).toBe('0.1.0');
    expect(e.timestamp).toBeTruthy();
  });

  it('SchemaValidationFailed includes errors in payload', () => {
    const errors = [{ field: 'id', expected: 'string', actual: 'undefined', message: 'Required' }];
    const e = createSchemaValidationFailed('intent-1', '0.1.0', errors);
    expect(e.type).toBe('SchemaValidationFailed');
    expect(e.payload.errors).toEqual(errors);
  });

  it('RuleEvaluationPassed has correct type and count', () => {
    const e = createRuleEvaluationPassed('intent-1', 3);
    expect(e.type).toBe('RuleEvaluationPassed');
    expect(e.payload.rules_evaluated).toBe(3);
  });

  it('RuleEvaluationDenied has correct type and reason', () => {
    const e = createRuleEvaluationDenied('intent-1', 'rule-1', 'bad action');
    expect(e.type).toBe('RuleEvaluationDenied');
    expect(e.payload.failing_rule).toBe('rule-1');
    expect(e.payload.reason).toBe('bad action');
  });

  it('EnforcementDecisionMade has correct type and outcome', () => {
    const e = createEnforcementDecisionMade('dec-1', 'intent-1', 'allowed');
    expect(e.type).toBe('EnforcementDecisionMade');
    expect(e.payload.decision_id).toBe('dec-1');
    expect(e.payload.outcome).toBe('allowed');
  });
});
