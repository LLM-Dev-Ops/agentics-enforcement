import { describe, it, expect } from 'vitest';
import { createIntentCompletenessRule } from '../intent-completeness-rule.js';
import { createActionAllowlistRule } from '../action-allowlist-rule.js';
import type { ExecutionIntent } from '../../contracts/index.js';

function makeIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    id: 'i1', caller: 'c', action: 'simulate', target: 't',
    parameters: {}, metadata: {}, is_meta_simulation: false,
    ...overrides,
  };
}

describe('Intent Completeness Rule', () => {
  const rule = createIntentCompletenessRule();

  it('passes for complete intent', () => {
    expect(rule.evaluate(makeIntent()).passed).toBe(true);
  });

  it('fails for empty id', () => {
    const r = rule.evaluate(makeIntent({ id: '' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('id');
  });

  it('fails for empty caller', () => {
    const r = rule.evaluate(makeIntent({ caller: '' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('caller');
  });

  it('fails for empty action', () => {
    const r = rule.evaluate(makeIntent({ action: '' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('action');
  });

  it('fails for empty target', () => {
    const r = rule.evaluate(makeIntent({ target: '' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('target');
  });

  it('reports all missing fields at once', () => {
    const r = rule.evaluate(makeIntent({ id: '', caller: '', action: '', target: '' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('id');
    expect(r.reason).toContain('caller');
    expect(r.reason).toContain('action');
    expect(r.reason).toContain('target');
  });

  it('has priority 100', () => {
    expect(rule.priority).toBe(100);
  });
});

describe('Action Allowlist Rule', () => {
  const rule = createActionAllowlistRule();

  it('passes for default allowed action "simulate"', () => {
    expect(rule.evaluate(makeIntent({ action: 'simulate' })).passed).toBe(true);
  });

  it('passes for default allowed action "execute"', () => {
    expect(rule.evaluate(makeIntent({ action: 'execute' })).passed).toBe(true);
  });

  it('passes for all default actions', () => {
    for (const action of ['simulate', 'execute', 'validate', 'analyze', 'export']) {
      expect(rule.evaluate(makeIntent({ action })).passed).toBe(true);
    }
  });

  it('fails for unknown action', () => {
    const r = rule.evaluate(makeIntent({ action: 'destroy' }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('destroy');
    expect(r.reason).toContain('allowlist');
  });

  it('respects custom allowlist', () => {
    const custom = createActionAllowlistRule(['deploy', 'rollback']);
    expect(custom.evaluate(makeIntent({ action: 'deploy' })).passed).toBe(true);
    expect(custom.evaluate(makeIntent({ action: 'simulate' })).passed).toBe(false);
  });

  it('has priority 200', () => {
    expect(rule.priority).toBe(200);
  });
});
