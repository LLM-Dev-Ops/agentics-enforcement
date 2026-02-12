/**
 * Span — Entity representing a single operation in the execution hierarchy.
 * DDD-005: Entity (identity = span_id)
 *
 * Invariants:
 *   - execution_id is ALWAYS present.
 *   - parent_span_id is null ONLY for execution_root type.
 *   - Status transitions: open → closed_success | closed_failure. No reversal.
 *   - started_at is set at creation. ended_at is set when closed.
 */
import { randomUUID } from 'node:crypto';
import type { SpanType } from './span-type.js';
import type { SpanStatus } from './span-status.js';
import { canCloseSpan, InvalidSpanTransitionError } from './span-status.js';
import type { SpanAttributes } from './span-attributes.js';

export interface Span {
  readonly span_id: string;
  readonly parent_span_id: string | null;
  readonly execution_id: string;
  readonly type: SpanType;
  status: SpanStatus;
  readonly started_at: string;
  ended_at: string | null;
  readonly attributes: SpanAttributes;
}

export interface CreateSpanParams {
  parent_span_id: string | null;
  execution_id: string;
  type: SpanType;
  attributes: SpanAttributes;
}

/**
 * Create a new Span in 'open' status.
 * @internal — prefer SpanFactory methods for type-safe creation.
 */
export function createSpan(params: CreateSpanParams): Span {
  return {
    span_id: `span-${randomUUID()}`,
    parent_span_id: params.parent_span_id,
    execution_id: params.execution_id,
    type: params.type,
    status: 'open',
    started_at: new Date().toISOString(),
    ended_at: null,
    attributes: params.attributes,
  };
}

/**
 * Close a span with success or failure status.
 * Enforces the status transition invariant.
 * Spans MUST close on both success AND failure (DDD-005 Rule 5).
 */
export function closeSpan(span: Span, success: boolean): void {
  const target: SpanStatus = success ? 'closed_success' : 'closed_failure';
  if (!canCloseSpan(span.status)) {
    throw new InvalidSpanTransitionError(span.status, target);
  }
  span.status = target;
  span.ended_at = new Date().toISOString();
}
