/**
 * ExecutionId — Globally unique execution identity, minted ONLY by ruvector-service.
 * DDD-002: Value Object
 *
 * Invariants:
 *   - Immutable after creation.
 *   - Equality by value.
 *   - minted_by is always "ruvector-service".
 *   - Created ONLY inside ExecutionAcceptanceService.accept().
 */
import { randomUUID } from 'node:crypto';

export interface ExecutionId {
  readonly value: string;
  readonly minted_by: 'ruvector-service';
}

/**
 * Mint a new ExecutionId.
 * THIS FUNCTION MUST ONLY BE CALLED BY ExecutionAcceptanceService.
 * It is exported for that service's use — not for general consumption.
 *
 * @internal
 */
export function mintExecutionId(): ExecutionId {
  return Object.freeze({
    value: `exec-${randomUUID()}`,
    minted_by: 'ruvector-service',
  });
}

/** Value equality check for ExecutionId. */
export function executionIdEquals(a: ExecutionId, b: ExecutionId): boolean {
  return a.value === b.value;
}
