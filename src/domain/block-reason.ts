/**
 * BlockReason — Why an intent was blocked.
 * DDD-003: Value Object
 */

export type BlockPhase = 'schema_validation' | 'rule_evaluation';

export interface BlockReason {
  phase: BlockPhase;
  code: string;
  message: string;
  details: Record<string, unknown>;
}
