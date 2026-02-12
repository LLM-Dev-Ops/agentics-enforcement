/**
 * Domain event factories for the Cost domain.
 * DDD-004: Events contain ref_id only — NEVER raw values.
 */
import type { DomainEvent } from '../domain/events/event-bus.js';

function now(): string {
  return new Date().toISOString();
}

export function createCostComputationCompletedEvent(
  ref_id: string,
  execution_id: string,
): DomainEvent {
  return {
    type: 'CostComputationCompleted',
    timestamp: now(),
    payload: { ref_id, execution_id },
  };
}

export function createCostReferenceResolvedEvent(
  ref_id: string,
  resolved_by: string,
): DomainEvent {
  return {
    type: 'CostReferenceResolved',
    timestamp: now(),
    payload: { ref_id, resolved_by },
  };
}
