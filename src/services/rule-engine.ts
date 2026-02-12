/**
 * RuleEngine — Evaluates ordered enforcement rules against an intent.
 * DDD-003: Domain Service
 *
 * Invariants:
 *   - Rules evaluated in priority order (ascending — lower number = higher priority).
 *   - Disabled rules are skipped entirely.
 *   - First denial short-circuits (remaining rules not evaluated).
 */
import type { ExecutionIntent } from '../contracts/index.js';
import type { EnforcementRule } from '../domain/enforcement-rule.js';
import type { RuleEvaluationResult } from '../domain/rule-evaluation-result.js';
import type { PolicyDecision } from '../contracts/index.js';

export class RuleEngine {
  private rules: EnforcementRule[] = [];

  addRule(rule: EnforcementRule): void {
    this.rules.push(rule);
  }

  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.rule_id === ruleId);
    if (idx === -1) return false;
    this.rules.splice(idx, 1);
    return true;
  }

  listRules(): EnforcementRule[] {
    return [...this.rules].sort((a, b) => a.priority - b.priority);
  }

  evaluate(intent: ExecutionIntent): RuleEvaluationResult {
    const enabled = this.rules
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    let rulesEvaluated = 0;
    let rulesPassed = 0;

    for (const rule of enabled) {
      rulesEvaluated++;
      const result = rule.evaluate(intent);
      if (result.passed) {
        rulesPassed++;
      } else {
        // Short-circuit on first denial
        const decision: PolicyDecision = {
          decision: 'deny',
          rationale: result.reason ?? `Denied by rule: ${rule.name}`,
          rule_id: result.rule_id,
          evaluated_at: new Date().toISOString(),
        };
        return {
          passed: false,
          rules_evaluated: rulesEvaluated,
          rules_passed: rulesPassed,
          failing_rule: result.rule_id,
          policy_decision: decision,
        };
      }
    }

    // All rules passed
    const decision: PolicyDecision = {
      decision: 'allow',
      rationale: `All ${rulesEvaluated} rules passed`,
      rule_id: null,
      evaluated_at: new Date().toISOString(),
    };
    return {
      passed: true,
      rules_evaluated: rulesEvaluated,
      rules_passed: rulesPassed,
      failing_rule: null,
      policy_decision: decision,
    };
  }
}
