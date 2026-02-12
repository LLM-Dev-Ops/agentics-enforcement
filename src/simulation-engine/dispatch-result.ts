/**
 * DispatchResult — Value object representing the aggregated outcome of a dispatch.
 * ADR-005: Collect and aggregate results from core delegations.
 */
import type { CoreExecutionResult, ResultStatus } from '../contracts/index.js';

export type DispatchOutcome = 'success' | 'failure' | 'partial';

export interface DispatchResult {
  readonly execution_id: string;
  readonly outcome: DispatchOutcome;
  readonly results: readonly CoreExecutionResult[];
  readonly completed_at: string;
}

export function determineOutcome(results: readonly CoreExecutionResult[]): DispatchOutcome {
  if (results.length === 0) return 'success';

  const statuses = results.map((r) => r.status);
  const allSuccess = statuses.every((s) => s === 'success');
  if (allSuccess) return 'success';

  const anyFailure = statuses.some((s) => s === 'failure');
  if (anyFailure) return 'failure';

  return 'partial';
}

export function createDispatchResult(
  executionId: string,
  results: readonly CoreExecutionResult[],
): DispatchResult {
  return {
    execution_id: executionId,
    outcome: determineOutcome(results),
    results,
    completed_at: new Date().toISOString(),
  };
}
