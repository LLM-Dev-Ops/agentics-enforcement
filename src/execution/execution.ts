/**
 * Execution — Aggregate Root.
 * DDD-002: The central aggregate of the Execution domain.
 *
 * Invariants:
 *   - execution_id is set exactly once, at creation. Immutable.
 *   - root_span is created atomically with the execution.
 *   - Status transitions follow the defined lifecycle.
 *   - intent is immutable after creation.
 *   - simulation_resolution is REQUIRED and comes from upstream (never generated).
 *   - repo_name is REQUIRED and identifies the repository in the execution graph.
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
  readonly simulation_resolution: string;
  readonly repo_name: string;
}

/**
 * Create a new Execution aggregate in 'accepted' state.
 * Called only by ExecutionAcceptanceService.accept().
 *
 * simulation_resolution and repo_name are REQUIRED — they must come from
 * the upstream execution context. DO NOT generate default values.
 *
 * @internal
 */
export function createExecution(
  execution_id: ExecutionId,
  intent: ExecutionIntent,
  root_span: RootSpanMeta,
  simulation_resolution: string,
  repo_name: string,
  enforcement_decision: EnforcementDecision | null = null,
): Execution {
  if (!simulation_resolution) {
    throw new Error(
      `Cannot create execution: simulation_resolution is required (execution_id: ${execution_id.value})`,
    );
  }
  if (!repo_name) {
    throw new Error(
      `Cannot create execution: repo_name is required (execution_id: ${execution_id.value})`,
    );
  }

  return {
    execution_id,
    intent,
    status: 'accepted',
    root_span,
    results: [],
    created_at: new Date().toISOString(),
    caller: intent.caller,
    enforcement_decision,
    simulation_resolution,
    repo_name,
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
