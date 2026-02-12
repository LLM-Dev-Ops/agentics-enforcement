import { describe, it, expect } from 'vitest';
import { determineOutcome, createDispatchResult } from '../dispatch-result.js';
import type { CoreExecutionResult } from '../../contracts/index.js';

function makeResult(status: 'success' | 'failure' | 'partial', coreName = 'core-a'): CoreExecutionResult {
  return {
    core_name: coreName,
    execution_id: 'exec-1',
    status,
    evidence: { execution_id: 'exec-1', entries: [] },
    cost_ref: null,
    outputs: {},
  };
}

describe('determineOutcome', () => {
  it('returns success when all results are success', () => {
    expect(determineOutcome([makeResult('success'), makeResult('success')])).toBe('success');
  });

  it('returns success for empty results', () => {
    expect(determineOutcome([])).toBe('success');
  });

  it('returns failure when any result is failure', () => {
    expect(determineOutcome([makeResult('success'), makeResult('failure')])).toBe('failure');
  });

  it('returns failure when all results are failure', () => {
    expect(determineOutcome([makeResult('failure')])).toBe('failure');
  });

  it('returns partial when results include partial but no failure', () => {
    expect(determineOutcome([makeResult('success'), makeResult('partial')])).toBe('partial');
  });

  it('returns failure when results include both partial and failure', () => {
    expect(determineOutcome([makeResult('partial'), makeResult('failure')])).toBe('failure');
  });
});

describe('createDispatchResult', () => {
  it('creates a result with correct execution_id', () => {
    const result = createDispatchResult('exec-1', [makeResult('success')]);
    expect(result.execution_id).toBe('exec-1');
  });

  it('determines outcome from results', () => {
    const result = createDispatchResult('exec-1', [makeResult('failure')]);
    expect(result.outcome).toBe('failure');
  });

  it('includes all results', () => {
    const results = [makeResult('success', 'core-a'), makeResult('success', 'core-b')];
    const dispatch = createDispatchResult('exec-1', results);
    expect(dispatch.results).toHaveLength(2);
  });

  it('has a completed_at timestamp', () => {
    const result = createDispatchResult('exec-1', []);
    expect(result.completed_at).toBeTruthy();
    expect(() => new Date(result.completed_at)).not.toThrow();
  });
});
