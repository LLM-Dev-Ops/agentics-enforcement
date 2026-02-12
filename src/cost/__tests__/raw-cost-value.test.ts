import { describe, it, expect } from 'vitest';
import { createRawCostValue, type CostLineItem } from '../raw-cost-value.js';

describe('createRawCostValue', () => {
  it('creates a value with correct fields', () => {
    const breakdown: CostLineItem[] = [
      { category: 'compute', amount: 0.50, unit: 'per_request' },
    ];
    const raw = createRawCostValue(0.50, 'USD', breakdown, '1.0.0');
    expect(raw.amount).toBe(0.50);
    expect(raw.currency).toBe('USD');
    expect(raw.model_version).toBe('1.0.0');
  });

  it('supports TOKEN currency', () => {
    const raw = createRawCostValue(100, 'TOKEN', [], '1.0.0');
    expect(raw.currency).toBe('TOKEN');
  });

  it('preserves breakdown items', () => {
    const breakdown: CostLineItem[] = [
      { category: 'compute', amount: 0.30, unit: 'per_request' },
      { category: 'storage', amount: 0.20, unit: 'per_gb' },
    ];
    const raw = createRawCostValue(0.50, 'USD', breakdown, '1.0.0');
    expect(raw.breakdown).toHaveLength(2);
    expect(raw.breakdown[0].category).toBe('compute');
    expect(raw.breakdown[1].category).toBe('storage');
  });

  it('freezes the returned value', () => {
    const raw = createRawCostValue(1.0, 'USD', [], '1.0.0');
    expect(Object.isFrozen(raw)).toBe(true);
  });

  it('freezes the breakdown array', () => {
    const raw = createRawCostValue(1.0, 'USD', [{ category: 'x', amount: 1, unit: 'y' }], '1.0.0');
    expect(Object.isFrozen(raw.breakdown)).toBe(true);
  });

  it('handles zero amount', () => {
    const raw = createRawCostValue(0, 'USD', [], '1.0.0');
    expect(raw.amount).toBe(0);
  });
});
