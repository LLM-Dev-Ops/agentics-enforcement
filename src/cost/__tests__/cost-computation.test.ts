import { describe, it, expect } from 'vitest';
import {
  createCostComputation,
  completeCostComputation,
  InvalidComputationTransitionError,
  type CostParameters,
} from '../cost-computation.js';
import { createRawCostValue } from '../raw-cost-value.js';

function makeParams(overrides: Partial<CostParameters> = {}): CostParameters {
  return {
    resource_type: 'compute',
    quantity: 10,
    tier: 'standard',
    context: {},
    execution_id: 'exec-001',
    ...overrides,
  };
}

describe('createCostComputation', () => {
  it('creates a computation in pending status', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    expect(comp.status).toBe('pending');
  });

  it('generates a ref_id with cost- prefix', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    expect(comp.ref_id).toMatch(/^cost-/);
  });

  it('sets raw_result to null initially', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    expect(comp.raw_result).toBeNull();
  });

  it('sets computed_at to null initially', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    expect(comp.computed_at).toBeNull();
  });

  it('preserves parameters', () => {
    const params = makeParams({ resource_type: 'storage', quantity: 5 });
    const comp = createCostComputation(params, 'Data-Core');
    expect(comp.parameters.resource_type).toBe('storage');
    expect(comp.parameters.quantity).toBe(5);
  });

  it('preserves execution_id from parameters', () => {
    const comp = createCostComputation(makeParams({ execution_id: 'exec-42' }), 'Governance-Core');
    expect(comp.execution_id).toBe('exec-42');
  });

  it('preserves requested_by', () => {
    const comp = createCostComputation(makeParams(), 'Automation-Core');
    expect(comp.requested_by).toBe('Automation-Core');
  });

  it('sets created_at to a valid ISO string', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    expect(() => new Date(comp.created_at)).not.toThrow();
    expect(new Date(comp.created_at).toISOString()).toBe(comp.created_at);
  });

  it('generates unique ref_ids', () => {
    const a = createCostComputation(makeParams(), 'Security-Core');
    const b = createCostComputation(makeParams(), 'Security-Core');
    expect(a.ref_id).not.toBe(b.ref_id);
  });
});

describe('completeCostComputation', () => {
  it('transitions status to computed', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    const raw = createRawCostValue(0.10, 'USD', [], '1.0.0');
    completeCostComputation(comp, raw);
    expect(comp.status).toBe('computed');
  });

  it('sets raw_result', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    const raw = createRawCostValue(0.10, 'USD', [], '1.0.0');
    completeCostComputation(comp, raw);
    expect(comp.raw_result).toBe(raw);
  });

  it('sets computed_at to a valid ISO string', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    const raw = createRawCostValue(0.10, 'USD', [], '1.0.0');
    completeCostComputation(comp, raw);
    expect(comp.computed_at).not.toBeNull();
    expect(new Date(comp.computed_at!).toISOString()).toBe(comp.computed_at);
  });

  it('throws InvalidComputationTransitionError if already computed', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    const raw = createRawCostValue(0.10, 'USD', [], '1.0.0');
    completeCostComputation(comp, raw);
    expect(() => completeCostComputation(comp, raw)).toThrow(InvalidComputationTransitionError);
  });

  it('throws InvalidComputationTransitionError with correct message', () => {
    const comp = createCostComputation(makeParams(), 'Security-Core');
    const raw = createRawCostValue(0.10, 'USD', [], '1.0.0');
    completeCostComputation(comp, raw);
    expect(() => completeCostComputation(comp, raw)).toThrow("Cannot complete computation in 'computed' status");
  });
});
