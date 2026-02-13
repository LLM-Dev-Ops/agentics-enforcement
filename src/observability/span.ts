/**
 * Span — Entity representing a single operation in the execution hierarchy.
 * DDD-005: Entity (identity = span_id)
 *
 * Invariants:
 *   - execution_id is ALWAYS present and non-empty.
 *   - parent_span_id is null ONLY for execution_root type.
 *   - For ALL non-root spans, parent_span_id MUST be provided — throw if missing.
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

export class OrphanSpanError extends Error {
  override readonly name = 'OrphanSpanError';
  constructor(
    public readonly span_type: SpanType,
    public readonly execution_id: string,
  ) {
    super(
      `Cannot create non-root span of type '${span_type}' without parent_span_id (execution_id: ${execution_id})`,
    );
  }
}

export class MissingSpanIdentifierError extends Error {
  override readonly name = 'MissingSpanIdentifierError';
  constructor(
    public readonly field: string,
    public readonly span_type: SpanType,
  ) {
    super(`Span creation failed: ${field} is required (span_type: ${span_type})`);
  }
}

/**
 * Create a new Span in 'open' status.
 * Validates all identifiers strictly:
 *   - execution_id must be non-empty
 *   - Non-root spans MUST have parent_span_id (throws OrphanSpanError)
 *   - Root spans MUST have null parent_span_id
 *
 * @internal — prefer SpanFactory methods for type-safe creation.
 */
export function createSpan(params: CreateSpanParams): Span {
  // Validate execution_id
  if (!params.execution_id) {
    throw new MissingSpanIdentifierError('execution_id', params.type);
  }

  // Enforce: non-root spans MUST have parent_span_id
  if (params.type !== 'execution_root' && !params.parent_span_id) {
    throw new OrphanSpanError(params.type, params.execution_id);
  }

  // Enforce: root spans MUST NOT have parent_span_id
  if (params.type === 'execution_root' && params.parent_span_id !== null) {
    throw new Error(
      `Root span must have null parent_span_id, got '${params.parent_span_id}'`,
    );
  }

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
