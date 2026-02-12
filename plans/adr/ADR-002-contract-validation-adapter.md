# ADR-002: Contract Validation Adapter Pattern

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** agentics-enforcement (#53)
**SPARC Phase:** Phase 1

---

## Context

agentics-enforcement must validate incoming execution intents before they reach the execution layer. Two distinct validation concerns exist:

1. **Structural validation** — Does the data conform to the contract schema? (Schema concern, owned by agentics-contracts.)
2. **Business rule validation** — Does the intent pass enforcement policies? (Enforcement concern, owned by agentics-enforcement.)

These concerns must be separated clearly, and the order matters: structural validation must pass before business rules are evaluated (no point enforcing policies on malformed data).

## Decision

**Introduce a `ContractValidationAdapter` in agentics-enforcement that enforces a strict two-phase validation pipeline: schema first, rules second.**

### Design

```
ContractValidationAdapter
  ├── enforceExecutionIntent(intent: ExecutionIntent) → EnforcementResult
  │     1. validateAgainstSchema(intent, ExecutionIntent.schema)
  │     2. IF pass → applyEnforcementRules(intent)
  │     3. Emit contract_validation span regardless of outcome
  │
  ├── validateAgainstSchema(data, schema) → ValidationResult
  │     Pure schema validation, no business logic
  │
  └── applyEnforcementRules(intent) → PolicyDecision
        Business rules, rate limits, authorization checks
```

### Invariants

1. Schema validation ALWAYS runs first.
2. Enforcement rules ONLY run if schema validation passes.
3. A `contract_validation` span is emitted on every call (pass, schema-fail, or rule-fail).
4. The adapter imports schemas from agentics-contracts — it MUST NOT define schemas locally.
5. `EnforcementResult` is either `allowed(intent_id)` or `blocked(reason, detail)`.

## Consequences

### Positive
- Clean separation of schema vs. business concerns.
- Schema validation is reusable (meta simulations can call `validateAgainstSchema` alone).
- Every enforcement decision is traced via spans.
- Adapter pattern makes it easy to test each phase independently.

### Negative
- Two-phase validation adds marginal latency (schema check + rule check). Acceptable given these are pre-execution gates.
- Adapter must be kept in sync with contracts schema versions.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Inline schema validation in each enforcement rule | Scatters schema concerns across rules. Impossible to guarantee "schema first." |
| Middleware chain (Express-style) | Over-engineered for two phases. Adapter is simpler and explicit. |
| Schema validation in agentics-contracts itself | Contracts must be dependency-free. Validation logic (error formatting, span emission) doesn't belong there. |
| Single `validate()` method mixing both concerns | Violates separation. Makes it impossible for meta simulations to skip business rules while keeping schema validation. |

## Compliance

- SPARC Pseudocode Phase 1: `ContractValidationAdapter` class with `enforceExecutionIntent`, `validateAgainstSchema`, `applyEnforcementRules`
- SPARC Specification Section 5: Span type `contract_validation` with fields `intent_id`, `schema_version`, `pass/fail`
- SPARC Specification Section 7: Meta simulations bypass rules but NOT schema validation
