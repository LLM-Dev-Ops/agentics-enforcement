import { describe, it, expect } from 'vitest';
import { canCloseSpan, InvalidSpanTransitionError } from '../span-status.js';

describe('SpanStatus', () => {
  it('canCloseSpan returns true for open', () => {
    expect(canCloseSpan('open')).toBe(true);
  });

  it('canCloseSpan returns false for closed_success', () => {
    expect(canCloseSpan('closed_success')).toBe(false);
  });

  it('canCloseSpan returns false for closed_failure', () => {
    expect(canCloseSpan('closed_failure')).toBe(false);
  });
});

describe('InvalidSpanTransitionError', () => {
  it('has correct name', () => {
    const err = new InvalidSpanTransitionError('closed_success', 'closed_failure');
    expect(err.name).toBe('InvalidSpanTransitionError');
  });

  it('includes from and to in message', () => {
    const err = new InvalidSpanTransitionError('closed_success', 'closed_failure');
    expect(err.message).toContain('closed_success');
    expect(err.message).toContain('closed_failure');
  });

  it('exposes from and to properties', () => {
    const err = new InvalidSpanTransitionError('closed_failure', 'closed_success');
    expect(err.from).toBe('closed_failure');
    expect(err.to).toBe('closed_success');
  });
});
