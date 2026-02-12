import { describe, it, expect } from 'vitest';
import { createExecution, transitionExecution } from '../execution.js';
import { mintExecutionId } from '../execution-id.js';
import { createRootSpanMeta } from '../root-span-meta.js';
import { InvalidTransitionError } from '../execution-status.js';
import type { ExecutionIntent } from '../../contracts/index.js';
import type { EnforcementDecision } from '../../domain/enforcement-decision.js';

function makeIntent(): ExecutionIntent {
  return {
    id: 'intent-1', caller: 'cli-user', action: 'simulate', target: 'security-core',
    parameters: {}, metadata: {}, is_meta_simulation: false,
  };
}

function makeExecution() {
  const execId = mintExecutionId();
  const span = createRootSpanMeta(execId.value, 'intent-1', 'cli-user');
  return createExecution(execId, makeIntent(), span);
}

describe('Execution aggregate', () => {
  it('is created in accepted state', () => {
    const exec = makeExecution();
    expect(exec.status).toBe('accepted');
  });

  it('has execution_id set at creation', () => {
    const exec = makeExecution();
    expect(exec.execution_id.value).toMatch(/^exec-/);
    expect(exec.execution_id.minted_by).toBe('ruvector-service');
  });

  it('has root_span created atomically', () => {
    const exec = makeExecution();
    expect(exec.root_span.type).toBe('execution_root');
    expect(exec.root_span.execution_id).toBe(exec.execution_id.value);
    expect(exec.root_span.span_id).toMatch(/^span-/);
  });

  it('has immutable intent', () => {
    const exec = makeExecution();
    expect(exec.intent.id).toBe('intent-1');
    expect(exec.intent.caller).toBe('cli-user');
  });

  it('has caller extracted from intent', () => {
    const exec = makeExecution();
    expect(exec.caller).toBe('cli-user');
  });

  it('has created_at timestamp', () => {
    const exec = makeExecution();
    expect(exec.created_at).toBeTruthy();
    expect(() => new Date(exec.created_at)).not.toThrow();
  });

  it('starts with empty results', () => {
    const exec = makeExecution();
    expect(exec.results).toEqual([]);
  });

  it('has enforcement_decision = null by default', () => {
    const exec = makeExecution();
    expect(exec.enforcement_decision).toBeNull();
  });

  it('accepts enforcement_decision when provided', () => {
    const execId = mintExecutionId();
    const span = createRootSpanMeta(execId.value, 'intent-1', 'cli-user');
    const decision: EnforcementDecision = {
      decision_id: 'dec-1',
      intent_id: 'intent-1',
      schema_validation: { passed: true, schema_name: 'ExecutionIntent', schema_version: '0.1.0', errors: [] },
      rule_evaluation: null,
      outcome: 'allowed',
      block_reason: null,
      span_emitted: false,
      evaluated_at: new Date().toISOString(),
      schema_version: '0.1.0',
    };
    const exec = createExecution(execId, makeIntent(), span, decision);
    expect(exec.enforcement_decision).not.toBeNull();
    expect(exec.enforcement_decision!.decision_id).toBe('dec-1');
    expect(exec.enforcement_decision!.outcome).toBe('allowed');
  });
});

describe('Execution lifecycle transitions', () => {
  it('accepted → validating', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'validating');
    expect(exec.status).toBe('validating');
  });

  it('accepted → validating → dispatching', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'validating');
    transitionExecution(exec, 'dispatching');
    expect(exec.status).toBe('dispatching');
  });

  it('accepted → validating → dispatching → completed', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'validating');
    transitionExecution(exec, 'dispatching');
    transitionExecution(exec, 'completed');
    expect(exec.status).toBe('completed');
  });

  it('accepted → failed', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'failed');
    expect(exec.status).toBe('failed');
  });

  it('accepted → rejected', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'rejected');
    expect(exec.status).toBe('rejected');
  });

  it('throws InvalidTransitionError for invalid transition', () => {
    const exec = makeExecution();
    // accepted → completed is invalid (skips validating/dispatching)
    expect(() => transitionExecution(exec, 'completed')).toThrow(InvalidTransitionError);
  });

  it('throws for transitions out of terminal states', () => {
    const exec = makeExecution();
    transitionExecution(exec, 'validating');
    transitionExecution(exec, 'dispatching');
    transitionExecution(exec, 'completed');
    expect(() => transitionExecution(exec, 'failed')).toThrow(InvalidTransitionError);
  });
});
