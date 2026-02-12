/**
 * SpanType — Closed set of valid span types in the execution hierarchy.
 * DDD-005: Value Object (enum)
 *
 * No other span types are valid. Unknown types indicate a hierarchy violation.
 */

export type SpanType =
  | 'execution_root'
  | 'contract_validation'
  | 'core'
  | 'repo'
  | 'agent';

/** All valid span types, for runtime validation. */
export const SPAN_TYPES: readonly SpanType[] = [
  'execution_root',
  'contract_validation',
  'core',
  'repo',
  'agent',
] as const;

/** Check if a string is a valid SpanType. */
export function isValidSpanType(value: string): value is SpanType {
  return (SPAN_TYPES as readonly string[]).includes(value);
}

/**
 * Valid parent-child relationships in the span hierarchy.
 * Key = parent type, Value = allowed child types.
 *
 * Hierarchy:
 *   execution_root → [contract_validation, core]
 *   core           → [repo]
 *   repo           → [agent]
 *   agent          → []  (leaf)
 *   contract_validation → []  (leaf)
 */
export const VALID_CHILD_TYPES: ReadonlyMap<SpanType, readonly SpanType[]> = new Map([
  ['execution_root', ['contract_validation', 'core']],
  ['core', ['repo']],
  ['repo', ['agent']],
  ['agent', []],
  ['contract_validation', []],
]);
