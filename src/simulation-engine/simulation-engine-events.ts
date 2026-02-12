/**
 * Domain event factories for the Simulation Engine.
 * ADR-005: Domain Events
 */
import type { DomainEvent } from '../domain/events/event-bus.js';
import type { DispatchOutcome } from './dispatch-result.js';

function now(): string {
  return new Date().toISOString();
}

export function createDispatchStartedEvent(
  execution_id: string,
  core_count: number,
): DomainEvent {
  return {
    type: 'DispatchStarted',
    timestamp: now(),
    payload: { execution_id, core_count },
  };
}

export function createCoreDelegationStartedEvent(
  execution_id: string,
  core_name: string,
): DomainEvent {
  return {
    type: 'CoreDelegationStarted',
    timestamp: now(),
    payload: { execution_id, core_name },
  };
}

export function createCoreDelegationCompletedEvent(
  execution_id: string,
  core_name: string,
  status: string,
): DomainEvent {
  return {
    type: 'CoreDelegationCompleted',
    timestamp: now(),
    payload: { execution_id, core_name, status },
  };
}

export function createDispatchCompletedEvent(
  execution_id: string,
  outcome: DispatchOutcome,
  result_count: number,
): DomainEvent {
  return {
    type: 'DispatchCompleted',
    timestamp: now(),
    payload: { execution_id, outcome, result_count },
  };
}

export function createDispatchFailedEvent(
  execution_id: string,
  reason: string,
): DomainEvent {
  return {
    type: 'DispatchFailed',
    timestamp: now(),
    payload: { execution_id, reason },
  };
}
