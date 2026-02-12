import { describe, it, expect } from 'vitest';
import { mintExecutionId, executionIdEquals } from '../execution-id.js';

describe('ExecutionId', () => {
  it('mints a unique ID with "exec-" prefix', () => {
    const id = mintExecutionId();
    expect(id.value).toMatch(/^exec-/);
    expect(id.value.length).toBeGreaterThan(5);
  });

  it('always has minted_by = "ruvector-service"', () => {
    const id = mintExecutionId();
    expect(id.minted_by).toBe('ruvector-service');
  });

  it('is frozen (immutable)', () => {
    const id = mintExecutionId();
    expect(Object.isFrozen(id)).toBe(true);
  });

  it('consecutive mints produce different IDs', () => {
    const a = mintExecutionId();
    const b = mintExecutionId();
    expect(a.value).not.toBe(b.value);
  });

  it('executionIdEquals returns true for same value', () => {
    const a = mintExecutionId();
    // Simulate another reference with the same value
    const b = { value: a.value, minted_by: 'ruvector-service' as const };
    expect(executionIdEquals(a, b)).toBe(true);
  });

  it('executionIdEquals returns false for different values', () => {
    const a = mintExecutionId();
    const b = mintExecutionId();
    expect(executionIdEquals(a, b)).toBe(false);
  });
});
