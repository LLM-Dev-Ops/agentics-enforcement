/**
 * Execution — Aggregate Root.
 * DDD-002: The central aggregate of the Execution domain.
 *
 * Invariants:
 *   - execution_id is set exactly once, at creation. Immutable.
 *   - root_span is created atomically with the execution.
 *   - Status transitions follow the defined lifecycle.
 *   - intent is immutable after creation.
 */
import type { ExecutionId } from './execution-id.js';
import type { ExecutionStatus } from './execution-status.js';
import { canTransition, InvalidTransitionError } from './execution-status.js';
import type { RootSpanMeta } from './root-span-meta.js';
import type { ExecutionIntent, CoreExecutionResult } from '../contracts/index.js';
import type { EnforcementDecision } from '../domain/enforcement-decision.js';

export interface Execution {
  readonly execution_id: ExecutionId;
  readonly intent: ExecutionIntent;
  status: ExecutionStatus;
  readonly root_span: RootSpanMeta;
  readonly results: CoreExecutionResult[];
  readonly created_at: string;
  readonly caller: string;
  readonly enforcement_decision: EnforcementDecision | null;
}

/**
 * Create a new Execution aggregate in 'accepted' state.
 * Called only by ExecutionAcceptanceService.accept().
 * @internal
 */
export function createExecution(
  execution_id: ExecutionId,
  intent: ExecutionIntent,
  root_span: RootSpanMeta,
  enforcement_decision: EnforcementDecision | null = null,
): Execution {
  return {
    execution_id,
    intent,
    status: 'accepted',
    root_span,
    results: [],
    created_at: new Date().toISOString(),
    caller: intent.caller,
    enforcement_decision,
  };
}

/**
 * Transition an execution to a new status.
 * Enforces the lifecycle state machine.
 */
export function transitionExecution(
  execution: Execution,
  newStatus: ExecutionStatus,
): void {
  if (!canTransition(execution.status, newStatus)) {
    throw new InvalidTransitionError(execution.status, newStatus);
  }
  // Mutable status field — the only mutable part of the aggregate.
  execution.status = newStatus;
}
