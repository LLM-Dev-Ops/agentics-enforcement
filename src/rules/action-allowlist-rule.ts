/**
 * Built-in rule: Action Allowlist (priority 200).
 * Checks that intent.action is in a known allowlist.
 */
import type { EnforcementRule, RuleResult } from '../domain/enforcement-rule.js';
import type { ExecutionIntent } from '../contracts/index.js';

const RULE_ID = 'builtin:action-allowlist';

const DEFAULT_ALLOWLIST = ['simulate', 'execute', 'validate', 'analyze', 'export'];

export function createActionAllowlistRule(
  allowlist: string[] = DEFAULT_ALLOWLIST,
): EnforcementRule {
  const allowed = new Set(allowlist);

  return {
    rule_id: RULE_ID,
    name: 'Action Allowlist',
    description: `Verifies action is one of: ${[...allowed].join(', ')}`,
    priority: 200,
    enabled: true,
    evaluate(intent: ExecutionIntent): RuleResult {
      if (!allowed.has(intent.action)) {
        return {
          passed: false,
          rule_id: RULE_ID,
          reason: `Action "${intent.action}" is not in the allowlist: ${[...allowed].join(', ')}`,
        };
      }
      return { passed: true, rule_id: RULE_ID, reason: null };
    },
  };
}
