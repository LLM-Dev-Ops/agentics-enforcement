/**
 * EnforcementRule entity + RuleResult value object.
 * DDD-003: Entity
 */
import type { ExecutionIntent } from '../contracts/index.js';

export interface RuleResult {
  passed: boolean;
  rule_id: string;
  reason: string | null;
}

export interface EnforcementRule {
  rule_id: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  evaluate: (intent: ExecutionIntent) => RuleResult;
}
