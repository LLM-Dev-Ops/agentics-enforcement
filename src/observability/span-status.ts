/**
 * SpanStatus — Lifecycle state of a Span.
 * DDD-005: Value Object (enum)
 *
 * Transitions: open → closed_success | closed_failure. No other transitions.
 */

export type SpanStatus = 'open' | 'closed_success' | 'closed_failure';

export function canCloseSpan(current: SpanStatus): boolean {
  return current === 'open';
}

export class InvalidSpanTransitionError extends Error {
  override readonly name = 'InvalidSpanTransitionError';
  constructor(
    public readonly from: SpanStatus,
    public readonly to: SpanStatus,
  ) {
    super(`Invalid span status transition: ${from} → ${to}`);
  }
}
