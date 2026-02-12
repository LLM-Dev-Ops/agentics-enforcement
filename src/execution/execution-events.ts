/**
 * Execution domain events — ExecutionAccepted and ExecutionRejected.
 * DDD-002: Domain Events
 */
import type { DomainEvent } from '../domain/events/event-bus.js';

function now(): string {
  return new Date().toISOString();
}

export function createExecutionAccepted(
  execution_id: string,
  intent_id: string,
  root_span_id: string,
): DomainEvent {
  return {
    type: 'ExecutionAccepted',
    timestamp: now(),
    payload: { execution_id, intent_id, root_span_id },
  };
}

export function createExecutionRejected(
  intent_id: string,
  reason: string,
): DomainEvent {
  return {
    type: 'ExecutionRejected',
    timestamp: now(),
    payload: { intent_id, reason },
  };
}
