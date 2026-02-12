/**
 * Domain event factories for the Observability domain.
 * DDD-005: Domain Events
 */
import type { DomainEvent } from '../domain/events/event-bus.js';
import type { SpanType } from './span-type.js';
import type { ViolationType } from './span-tree-validator.js';

function now(): string {
  return new Date().toISOString();
}

export function createSpanCreatedEvent(
  span_id: string,
  execution_id: string,
  span_type: SpanType,
  parent_span_id: string | null,
): DomainEvent {
  return {
    type: 'SpanCreated',
    timestamp: now(),
    payload: { span_id, execution_id, span_type, parent_span_id },
  };
}

export function createSpanClosedEvent(
  span_id: string,
  execution_id: string,
  status: 'closed_success' | 'closed_failure',
  ended_at: string,
): DomainEvent {
  return {
    type: 'SpanClosed',
    timestamp: now(),
    payload: { span_id, execution_id, status, ended_at },
  };
}

export function createSpanTreeCompletedEvent(
  execution_id: string,
  span_count: number,
  tree_depth: number,
): DomainEvent {
  return {
    type: 'SpanTreeCompleted',
    timestamp: now(),
    payload: { execution_id, span_count, tree_depth },
  };
}

export function createSpanTreeBrokenEvent(
  execution_id: string,
  violation_type: ViolationType,
  details: Record<string, unknown>,
): DomainEvent {
  return {
    type: 'SpanTreeBroken',
    timestamp: now(),
    payload: { execution_id, violation_type, details },
  };
}
