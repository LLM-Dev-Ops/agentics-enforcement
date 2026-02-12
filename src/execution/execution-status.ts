/**
 * ExecutionStatus — Lifecycle states of an Execution aggregate.
 * DDD-002: Value Object (enum)
 *
 * Lifecycle:
 *   [none] → accepted → validating → dispatching → completed
 *                │            │              │
 *                │ reject()   │ fail()       │ fail()
 *                ▼            ▼              ▼
 *           [rejected]    [failed]       [failed]
 */
export type ExecutionStatus =
  | 'accepted'
  | 'validating'
  | 'dispatching'
  | 'completed'
  | 'failed'
  | 'rejected';

/** Valid state transitions for the Execution lifecycle. */
const VALID_TRANSITIONS: ReadonlyMap<ExecutionStatus, readonly ExecutionStatus[]> = new Map([
  ['accepted', ['validating', 'rejected', 'failed']],
  ['validating', ['dispatching', 'failed']],
  ['dispatching', ['completed', 'failed']],
  ['completed', []],
  ['failed', []],
  ['rejected', []],
]);

export function canTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  return allowed !== undefined && allowed.includes(to);
}

export class InvalidTransitionError extends Error {
  override readonly name = 'InvalidTransitionError';
  constructor(
    public readonly from: ExecutionStatus,
    public readonly to: ExecutionStatus,
  ) {
    super(`Invalid execution status transition: ${from} → ${to}`);
  }
}
