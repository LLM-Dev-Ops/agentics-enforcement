import { describe, it, expect } from 'vitest';
import { RuleEngine } from '../rule-engine.js';
import type { EnforcementRule } from '../../domain/enforcement-rule.js';
import type { ExecutionIntent } from '../../contracts/index.js';

function makeIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    id: 'i1', caller: 'c', action: 'simulate', target: 't',
    parameters: {}, metadata: {}, is_meta_simulation: false,
    ...overrides,
  };
}

function passingRule(id: string, priority: number): EnforcementRule {
  return {
    rule_id: id, name: id, description: '', priority, enabled: true,
    evaluate: () => ({ passed: true, rule_id: id, reason: null }),
  };
}

function failingRule(id: string, priority: number, reason = 'denied'): EnforcementRule {
  return {
    rule_id: id, name: id, description: '', priority, enabled: true,
    evaluate: () => ({ passed: false, rule_id: id, reason }),
  };
}

function disabledRule(id: string, priority: number): EnforcementRule {
  return {
    rule_id: id, name: id, description: '', priority, enabled: false,
    evaluate: () => ({ passed: true, rule_id: id, reason: null }),
  };
}

describe('RuleEngine', () => {
  it('empty engine (no rules) returns passed with 0 evaluated', () => {
    const engine = new RuleEngine();
    const r = engine.evaluate(makeIntent());
    expect(r.passed).toBe(true);
    expect(r.rules_evaluated).toBe(0);
    expect(r.rules_passed).toBe(0);
    expect(r.failing_rule).toBeNull();
    expect(r.policy_decision.decision).toBe('allow');
  });

  it('single passing rule returns passed', () => {
    const engine = new RuleEngine();
    engine.addRule(passingRule('r1', 100));
    const r = engine.evaluate(makeIntent());
    expect(r.passed).toBe(true);
    expect(r.rules_evaluated).toBe(1);
    expect(r.rules_passed).toBe(1);
  });

  it('single failing rule returns failed with correct failing_rule', () => {
    const engine = new RuleEngine();
    engine.addRule(failingRule('r1', 100, 'bad'));
    const r = engine.evaluate(makeIntent());
    expect(r.passed).toBe(false);
    expect(r.failing_rule).toBe('r1');
    expect(r.policy_decision.decision).toBe('deny');
    expect(r.policy_decision.rule_id).toBe('r1');
  });

  it('evaluates rules in priority order (ascending)', () => {
    const order: string[] = [];
    const engine = new RuleEngine();
    engine.addRule({
      rule_id: 'r300', name: 'r300', description: '', priority: 300, enabled: true,
      evaluate: () => { order.push('r300'); return { passed: true, rule_id: 'r300', reason: null }; },
    });
    engine.addRule({
      rule_id: 'r100', name: 'r100', description: '', priority: 100, enabled: true,
      evaluate: () => { order.push('r100'); return { passed: true, rule_id: 'r100', reason: null }; },
    });
    engine.addRule({
      rule_id: 'r200', name: 'r200', description: '', priority: 200, enabled: true,
      evaluate: () => { order.push('r200'); return { passed: true, rule_id: 'r200', reason: null }; },
    });
    engine.evaluate(makeIntent());
    expect(order).toEqual(['r100', 'r200', 'r300']);
  });

  it('disabled rules are skipped', () => {
    const engine = new RuleEngine();
    engine.addRule(disabledRule('disabled', 50));
    engine.addRule(passingRule('enabled', 100));
    const r = engine.evaluate(makeIntent());
    expect(r.rules_evaluated).toBe(1); // only the enabled one
    expect(r.rules_passed).toBe(1);
  });

  it('short-circuits after first denial', () => {
    let thirdCalled = false;
    const engine = new RuleEngine();
    engine.addRule(passingRule('r1', 100));
    engine.addRule(failingRule('r2', 200));
    engine.addRule({
      rule_id: 'r3', name: 'r3', description: '', priority: 300, enabled: true,
      evaluate: () => { thirdCalled = true; return { passed: true, rule_id: 'r3', reason: null }; },
    });
    const r = engine.evaluate(makeIntent());
    expect(r.passed).toBe(false);
    expect(r.rules_evaluated).toBe(2); // r1 + r2, NOT r3
    expect(r.rules_passed).toBe(1);
    expect(thirdCalled).toBe(false);
  });

  it('removeRule returns true for existing, false for non-existing', () => {
    const engine = new RuleEngine();
    engine.addRule(passingRule('r1', 100));
    expect(engine.removeRule('r1')).toBe(true);
    expect(engine.removeRule('r1')).toBe(false);
    expect(engine.removeRule('nonexistent')).toBe(false);
  });

  it('listRules returns sorted copy', () => {
    const engine = new RuleEngine();
    engine.addRule(passingRule('r300', 300));
    engine.addRule(passingRule('r100', 100));
    const list = engine.listRules();
    expect(list[0].rule_id).toBe('r100');
    expect(list[1].rule_id).toBe('r300');
    // Verify it's a copy
    list.push(passingRule('rX', 999));
    expect(engine.listRules()).toHaveLength(2);
  });
});
