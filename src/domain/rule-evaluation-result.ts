/**
 * RuleEvaluationResult — Phase 2 output.
 * DDD-003: Value Object
 */
import type { PolicyDecision } from '../contracts/index.js';

export interface RuleEvaluationResult {
  passed: boolean;
  rules_evaluated: number;
  rules_passed: number;
  failing_rule: string | null;
  policy_decision: PolicyDecision;
}
