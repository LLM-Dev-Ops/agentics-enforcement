/**
 * CostComputation — Aggregate Root for the Cost domain.
 * DDD-004: Tracks the full lifecycle of a cost calculation.
 *
 * Invariants:
 *   - ref_id is set at creation and immutable.
 *   - raw_result is null until status transitions to 'computed'.
 *   - raw_result is INTERNAL ONLY — never serialized externally.
 *   - Status transitions: pending → computed. No reversal.
 */
import { randomUUID } from 'node:crypto';
import type { RawCostValue } from './raw-cost-value.js';

export type ComputationStatus = 'pending' | 'computed' | 'expired';

export interface CostParameters {
  readonly resource_type: string;
  readonly quantity: number;
  readonly tier: string;
  readonly context: Record<string, unknown>;
  readonly execution_id: string;
}

export interface CostComputation {
  readonly ref_id: string;
  readonly parameters: CostParameters;
  raw_result: RawCostValue | null;
  status: ComputationStatus;
  readonly execution_id: string;
  readonly requested_by: string;
  readonly created_at: string;
  computed_at: string | null;
}

export function createCostComputation(
  params: CostParameters,
  requestedBy: string,
): CostComputation {
  return {
    ref_id: `cost-${randomUUID()}`,
    parameters: params,
    raw_result: null,
    status: 'pending',
    execution_id: params.execution_id,
    requested_by: requestedBy,
    created_at: new Date().toISOString(),
    computed_at: null,
  };
}

export class InvalidComputationTransitionError extends Error {
  override readonly name = 'InvalidComputationTransitionError';
  constructor(currentStatus: ComputationStatus) {
    super(`Cannot complete computation in '${currentStatus}' status`);
  }
}

export function completeCostComputation(
  computation: CostComputation,
  rawResult: RawCostValue,
): void {
  if (computation.status !== 'pending') {
    throw new InvalidComputationTransitionError(computation.status);
  }
  computation.raw_result = rawResult;
  computation.status = 'computed';
  computation.computed_at = new Date().toISOString();
}
