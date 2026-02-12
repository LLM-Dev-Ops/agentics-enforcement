/**
 * EnforcementResult — Returned to the caller (CLI).
 * DDD-003: Value Object
 */
import type { EnforcementOutcome } from './enforcement-outcome.js';
import type { BlockReason } from './block-reason.js';

export interface EnforcementResult {
  outcome: EnforcementOutcome;
  intent_id: string;
  block_reason: BlockReason | null;
  decision_id: string;
}

export function createAllowed(
  intent_id: string,
  decision_id: string,
): EnforcementResult {
  return { outcome: 'allowed', intent_id, block_reason: null, decision_id };
}

export function createBlocked(
  intent_id: string,
  decision_id: string,
  block_reason: BlockReason,
): EnforcementResult {
  return { outcome: 'blocked', intent_id, block_reason, decision_id };
}
