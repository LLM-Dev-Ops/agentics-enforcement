# DDD-003: Enforcement Domain Model

**Bounded Context:** Enforcement
**Related ADRs:** ADR-001, ADR-002, ADR-003

---

## Domain Overview

The Enforcement domain is the validation gateway for the entire Agentics fleet. It ensures that every execution intent conforms to the contract schemas (structural correctness) and passes business rules (policy compliance) before execution resources are committed. It is the last line of defense before intent reaches the execution layer.

---

## Aggregates

### 1. EnforcementDecision (Aggregate Root)

Represents a single enforcement evaluation — the full result of validating one `ExecutionIntent`.

```
EnforcementDecision [Aggregate Root]
├── decision_id: DecisionId            [Identity — unique per evaluation]
├── intent_id: string                  [Reference to the intent being evaluated]
├── schema_validation: SchemaValidationResult   [Phase 1 result]
├── rule_evaluation: RuleEvaluationResult?      [Phase 2 result — null if schema failed]
├── outcome: EnforcementOutcome        [allowed | blocked]
├── block_reason: BlockReason?         [null if allowed]
├── span_emitted: boolean              [must be true for decision to be complete]
├── evaluated_at: Timestamp
└── schema_version: string             [version of contract schema used]
```

**Invariants:**
- `schema_validation` is ALWAYS populated (runs unconditionally).
- `rule_evaluation` is populated ONLY if `schema_validation.passed == true`.
- `outcome` is `blocked` if either phase fails; `allowed` only if both pass.
- `span_emitted` must be `true` before the decision is returned to the caller.
- `schema_version` records exactly which contract schema version was used.

---

## Entities

### EnforcementRule

A single business rule that evaluates an intent.

```
EnforcementRule [Entity]
├── rule_id: RuleId
├── name: string
├── description: string
├── priority: integer            [evaluation order — lower number = higher priority]
├── enabled: boolean
└── evaluate(intent: ExecutionIntent) → RuleResult
```

**Invariants:**
- Rules are evaluated in priority order.
- A single `denied` result short-circuits evaluation (remaining rules are skipped).
- Disabled rules are skipped entirely.

---

## Value Objects

### SchemaValidationResult
```
SchemaValidationResult [Value Object]
├── passed: boolean
├── schema_name: string          [e.g., "ExecutionIntent"]
├── schema_version: string       [semver from agentics-contracts]
└── errors: List<SchemaError>    [empty if passed]

SchemaError [Value Object]
├── field: string                [JSON path to the invalid field]
├── expected: string             [expected type or constraint]
├── actual: string               [what was found]
└── message: string              [human-readable error]
```

### RuleEvaluationResult
```
RuleEvaluationResult [Value Object]
├── passed: boolean
├── rules_evaluated: integer
├── rules_passed: integer
├── failing_rule: RuleId?        [null if all passed]
└── policy_decision: PolicyDecision   [from contracts — allow or deny with rationale]
```

### EnforcementOutcome
```
EnforcementOutcome [Value Object — enum]
├── ALLOWED    → intent may proceed to ruvector
└── BLOCKED    → intent is rejected, execution does not start
```

### BlockReason
```
BlockReason [Value Object]
├── phase: "schema_validation" | "rule_evaluation"
├── code: string                 [machine-readable reason code]
├── message: string              [human-readable explanation]
└── details: Map<string, any>    [phase-specific error details]
```

### EnforcementResult
```
EnforcementResult [Value Object — returned to CLI]
├── outcome: EnforcementOutcome
├── intent_id: string
├── block_reason: BlockReason?
└── decision_id: DecisionId
```

---

## Domain Events

| Event | Triggered By | Payload | Consumers |
|---|---|---|---|
| `SchemaValidationPassed` | Schema check succeeds | intent_id, schema_version | Rule evaluator (proceed to Phase 2) |
| `SchemaValidationFailed` | Schema check fails | intent_id, schema_version, errors[] | Span emitter, decision finalizer |
| `RuleEvaluationPassed` | All rules pass | intent_id, rules_evaluated | Decision finalizer |
| `RuleEvaluationDenied` | A rule denies | intent_id, failing_rule, reason | Span emitter, decision finalizer |
| `EnforcementDecisionMade` | Decision finalized | decision_id, intent_id, outcome | CLI (response), audit log |
| `ContractValidationSpanEmitted` | Span emitted | decision_id, span_type, result | Span collector |

---

## Domain Services

### ContractValidationAdapter
**The primary domain service.** Orchestrates the two-phase enforcement pipeline.

```
ContractValidationAdapter [Domain Service]
├── enforceExecutionIntent(intent: ExecutionIntent) → EnforcementResult
│     1. Phase 1: validateAgainstSchema(intent, ExecutionIntent.schema)
│     2. IF schema fails → finalize as BLOCKED, emit span, return
│     3. Phase 2: applyEnforcementRules(intent)
│     4. IF rules deny → finalize as BLOCKED, emit span, return
│     5. Finalize as ALLOWED, emit span, return
│
├── validateAgainstSchema(data: any, schema: Schema) → SchemaValidationResult
│     Pure structural validation. No business logic.
│     Uses schema definitions from agentics-contracts.
│
└── applyEnforcementRules(intent: ExecutionIntent) → PolicyDecision
      Evaluate all enabled rules in priority order.
      Short-circuit on first denial.
      Return PolicyDecision (from contracts).
```

**Key property:** `validateAgainstSchema` is independently callable. This enables meta simulations to validate schema without triggering business rules (ADR-003).

### SchemaRegistry
**Manages imported schemas from agentics-contracts.**

```
SchemaRegistry [Domain Service]
├── getSchema(name: string) → Schema
│     Returns the canonical schema by name.
│     Throws if schema not found (means contracts dependency is broken).
│
├── getSchemaVersion() → string
│     Returns the current pinned contracts version.
│
└── validateDependency() → boolean
      Verifies that agentics-contracts is properly imported
      and all 6 schemas are available.
```

### RuleEngine
**Evaluates the ordered set of enforcement rules.**

```
RuleEngine [Domain Service]
├── evaluate(intent: ExecutionIntent) → RuleEvaluationResult
│     1. Load enabled rules, sorted by priority
│     2. For each rule: rule.evaluate(intent)
│     3. On first denial: short-circuit, return denied result
│     4. All pass: return passed result
│
├── addRule(rule: EnforcementRule)
├── removeRule(ruleId: RuleId)
└── listRules() → List<EnforcementRule>
```

---

## Repositories (DDD sense)

| Repository Interface | Aggregate/Entity | Operations |
|---|---|---|
| `EnforcementDecisionRepository` | EnforcementDecision | `save(decision)`, `findById(decisionId)`, `findByIntentId(intentId)` |
| `EnforcementRuleRepository` | EnforcementRule | `findAll()`, `findEnabled()`, `findById(ruleId)`, `save(rule)` |

---

## Domain Rules

1. **Schema-First Rule:** Schema validation ALWAYS executes before rule evaluation. No exceptions.
2. **No-Local-Schema Rule:** Schemas MUST be imported from agentics-contracts. The enforcement context MUST NOT define `ExecutionIntent`, `ExecutionGraph`, `CoreExecutionResult`, `EvidenceSummary`, `PolicyDecision`, or `CostReference` locally.
3. **Span-Always Rule:** A `contract_validation` span is emitted for every enforcement decision, regardless of outcome (pass, schema-fail, or rule-fail).
4. **Short-Circuit Rule:** Rule evaluation stops at the first denial. Remaining rules are not evaluated.
5. **Meta-Simulation Rule:** When `intent.is_meta_simulation == true`, only `validateAgainstSchema()` is called. `applyEnforcementRules()` is skipped. (Enforced by CLI, not by enforcement itself — enforcement always runs both if called via `enforceExecutionIntent()`.)

---

## Anti-Corruption Layer

The Enforcement context imports schemas from the Contract context. The `SchemaRegistry` service acts as a lightweight anti-corruption layer:

- It wraps the raw contract schema imports.
- It validates that the expected schemas are available.
- It provides version information for audit purposes.
- If the contracts package changes format, only `SchemaRegistry` needs updating.
