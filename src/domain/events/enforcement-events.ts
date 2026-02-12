/**
 * Typed event creators for the Enforcement domain.
 * DDD-003: Domain Events
 */
import type { DomainEvent } from './event-bus.js';
import type { SchemaError } from '../schema-validation-result.js';
import type { EnforcementOutcome } from '../enforcement-outcome.js';

function now(): string {
  return new Date().toISOString();
}

export function createSchemaValidationPassed(
  intent_id: string,
  schema_version: string,
): DomainEvent {
  return {
    type: 'SchemaValidationPassed',
    timestamp: now(),
    payload: { intent_id, schema_version },
  };
}

export function createSchemaValidationFailed(
  intent_id: string,
  schema_version: string,
  errors: SchemaError[],
): DomainEvent {
  return {
    type: 'SchemaValidationFailed',
    timestamp: now(),
    payload: { intent_id, schema_version, errors },
  };
}

export function createRuleEvaluationPassed(
  intent_id: string,
  rules_evaluated: number,
): DomainEvent {
  return {
    type: 'RuleEvaluationPassed',
    timestamp: now(),
    payload: { intent_id, rules_evaluated },
  };
}

export function createRuleEvaluationDenied(
  intent_id: string,
  failing_rule: string,
  reason: string,
): DomainEvent {
  return {
    type: 'RuleEvaluationDenied',
    timestamp: now(),
    payload: { intent_id, failing_rule, reason },
  };
}

export function createEnforcementDecisionMade(
  decision_id: string,
  intent_id: string,
  outcome: EnforcementOutcome,
): DomainEvent {
  return {
    type: 'EnforcementDecisionMade',
    timestamp: now(),
    payload: { decision_id, intent_id, outcome },
  };
}
