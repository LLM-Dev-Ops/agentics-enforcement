import { describe, it, expect } from 'vitest';
import { canTransition, InvalidTransitionError } from '../execution-status.js';

describe('ExecutionStatus transitions', () => {
  // Valid transitions
  it('accepted → validating is valid', () => {
    expect(canTransition('accepted', 'validating')).toBe(true);
  });

  it('accepted → rejected is valid', () => {
    expect(canTransition('accepted', 'rejected')).toBe(true);
  });

  it('accepted → failed is valid', () => {
    expect(canTransition('accepted', 'failed')).toBe(true);
  });

  it('validating → dispatching is valid', () => {
    expect(canTransition('validating', 'dispatching')).toBe(true);
  });

  it('validating → failed is valid', () => {
    expect(canTransition('validating', 'failed')).toBe(true);
  });

  it('dispatching → completed is valid', () => {
    expect(canTransition('dispatching', 'completed')).toBe(true);
  });

  it('dispatching → failed is valid', () => {
    expect(canTransition('dispatching', 'failed')).toBe(true);
  });

  // Invalid transitions
  it('completed → anything is invalid (terminal)', () => {
    expect(canTransition('completed', 'accepted')).toBe(false);
    expect(canTransition('completed', 'failed')).toBe(false);
  });

  it('failed → anything is invalid (terminal)', () => {
    expect(canTransition('failed', 'accepted')).toBe(false);
    expect(canTransition('failed', 'completed')).toBe(false);
  });

  it('rejected → anything is invalid (terminal)', () => {
    expect(canTransition('rejected', 'accepted')).toBe(false);
  });

  it('accepted → completed is invalid (skips validating/dispatching)', () => {
    expect(canTransition('accepted', 'completed')).toBe(false);
  });

  it('accepted → dispatching is invalid (skips validating)', () => {
    expect(canTransition('accepted', 'dispatching')).toBe(false);
  });
});

describe('InvalidTransitionError', () => {
  it('includes from and to in message', () => {
    const err = new InvalidTransitionError('completed', 'accepted');
    expect(err.message).toContain('completed');
    expect(err.message).toContain('accepted');
    expect(err.from).toBe('completed');
    expect(err.to).toBe('accepted');
  });
});
