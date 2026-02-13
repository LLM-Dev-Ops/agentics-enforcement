/**
 * ExecutionContext — Strict context propagation validation.
 * DDD-002: Value Object
 *
 * Every execution context accepted or forwarded MUST include:
 *   - execution_id
 *   - parent_span_id (REQUIRED — no orphan spans allowed)
 *   - simulation_resolution (from upstream — never generated locally)
 *   - repo_name (identifies the repository in the execution graph)
 *
 * If any required field is missing → throw immediately.
 * DO NOT allow optional parent linkage.
 */
import type { ExecutionContext } from '../contracts/index.js';

export class MissingExecutionContextFieldError extends Error {
  override readonly name = 'MissingExecutionContextFieldError';
  constructor(
    public readonly field: string,
    public readonly execution_id?: string,
  ) {
    super(
      `Execution context missing required field: ${field}` +
      (execution_id ? ` (execution_id: ${execution_id})` : ''),
    );
  }
}

/**
 * Validate that an execution context has all required fields.
 * Throws immediately if any field is missing.
 */
export function validateExecutionContext(ctx: Partial<ExecutionContext>): asserts ctx is ExecutionContext {
  if (!ctx.execution_id) {
    throw new MissingExecutionContextFieldError('execution_id');
  }
  if (!ctx.parent_span_id) {
    throw new MissingExecutionContextFieldError('parent_span_id', ctx.execution_id);
  }
  if (!ctx.simulation_resolution) {
    throw new MissingExecutionContextFieldError('simulation_resolution', ctx.execution_id);
  }
  if (!ctx.repo_name) {
    throw new MissingExecutionContextFieldError('repo_name', ctx.execution_id);
  }
}

/**
 * Build a validated execution context from parts.
 * Throws if any required field is missing.
 */
export function buildExecutionContext(parts: {
  execution_id: string;
  parent_span_id: string;
  simulation_resolution: string;
  repo_name: string;
}): ExecutionContext {
  validateExecutionContext(parts);
  return Object.freeze({ ...parts });
}
