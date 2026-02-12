/**
 * Built-in rule: Intent Completeness (priority 100).
 * Checks that all required string fields are non-empty.
 */
import type { EnforcementRule, RuleResult } from '../domain/enforcement-rule.js';
import type { ExecutionIntent } from '../contracts/index.js';

const RULE_ID = 'builtin:intent-completeness';

export function createIntentCompletenessRule(): EnforcementRule {
  return {
    rule_id: RULE_ID,
    name: 'Intent Completeness',
    description: 'Verifies that id, caller, action, and target are non-empty strings',
    priority: 100,
    enabled: true,
    evaluate(intent: ExecutionIntent): RuleResult {
      const missing: string[] = [];
      if (!intent.id) missing.push('id');
      if (!intent.caller) missing.push('caller');
      if (!intent.action) missing.push('action');
      if (!intent.target) missing.push('target');

      if (missing.length > 0) {
        return {
          passed: false,
          rule_id: RULE_ID,
          reason: `Missing required fields: ${missing.join(', ')}`,
        };
      }
      return { passed: true, rule_id: RULE_ID, reason: null };
    },
  };
}
