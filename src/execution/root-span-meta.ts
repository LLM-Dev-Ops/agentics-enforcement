/**
 * RootSpanMeta — Metadata for the root execution span.
 * DDD-002 / DDD-005: Created atomically with ExecutionId.
 *
 * This is the span metadata structure; actual span emission
 * is handled by the observability layer (future phase).
 * The root span captures the execution's origin point.
 */
import { randomUUID } from 'node:crypto';

export interface RootSpanMeta {
  readonly span_id: string;
  readonly type: 'execution_root';
  readonly execution_id: string;
  readonly intent_id: string;
  readonly caller: string;
  readonly created_at: string;
}

/**
 * Create root span metadata atomically with execution creation.
 * @internal — called only by ExecutionAcceptanceService.
 */
export function createRootSpanMeta(
  execution_id: string,
  intent_id: string,
  caller: string,
): RootSpanMeta {
  return Object.freeze({
    span_id: `span-${randomUUID()}`,
    type: 'execution_root' as const,
    execution_id,
    intent_id,
    caller,
    created_at: new Date().toISOString(),
  });
}
