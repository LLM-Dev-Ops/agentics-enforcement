# ADR-008: Execution Graph Hierarchy Validation

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** agentics-execution-engine (#52)
**SPARC Phase:** Phase 8

---

## Context

The canonical execution topology defines a strict hierarchy: `execution_root → Core → Repo → Agent`. However, without active validation, the execution graph can silently violate this hierarchy:

- A Core could call another Core (lateral dependency).
- A Repo could orchestrate other Repos (bypassing Core layer).
- An Agent could spawn execution outside its Repo.
- An execution root could skip the Core layer entirely.

These violations make the system unpredictable, unauditable, and impossible to reason about.

## Decision

**agentics-execution-engine validates every execution graph against the canonical hierarchy before execution proceeds. Graphs that violate the hierarchy are rejected with a detailed violation list.**

### Validation Rules

| Node Type | Parent Constraint | Children Constraint |
|---|---|---|
| `execution_root` | MUST have no parent (null) | ALL children MUST be type `core` |
| `core` | Parent MUST be `execution_root` | ALL children MUST be type `repo` |
| `repo` | Parent MUST be `core` | ALL children MUST be type `agent` |
| `agent` | Parent MUST be `repo` | MUST have no children (leaf) |

### Failure Behavior

- If ANY node violates its constraint, the entire graph is rejected.
- The rejection includes a list of all violations (not just the first).
- Rejected graphs do NOT execute. No spans are created. No downstream work begins.
- Unknown node types are treated as hierarchy violations.

### Validation Point

Graph validation occurs in agentics-execution-engine AFTER ruvector acceptance (execution_id exists) but BEFORE dispatch to Cores. This ensures:

1. The execution_id is available for error reporting.
2. No downstream resources are consumed on invalid graphs.

## Consequences

### Positive
- Execution topology is guaranteed to match the canonical hierarchy at runtime.
- Violations are caught before any work is done, not discovered mid-execution.
- Complete violation list aids debugging (not just first-failure).
- Graph validation is a single function, easily testable with synthetic graphs.

### Negative
- Graph validation adds a synchronous step before every execution. Cost is proportional to graph size.
- Strict hierarchy means no "shortcut" paths are possible, even if they would be operationally convenient.

### Risks
- If the execution engine is bypassed (direct calls to cores), graph validation doesn't apply. Mitigation: cores should only accept requests that carry a valid `execution_id` from ruvector (ADR-004), which implies they went through the engine.
- Complex graphs with many nodes could make validation slow. Mitigation: validation is O(n) — single pass over all nodes.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Validate at graph construction time | Construction may happen in multiple places. Validation at the engine is a single choke point. |
| Warn on violations but allow execution | Defeats the purpose. Violations must be blocking. |
| Validate only the first violation | Partial reporting makes debugging harder. Return all violations. |
| Schema-level graph validation (in contracts) | Contracts define structure, not runtime validation logic. Engine owns execution-time checks. |

## Compliance

- SPARC Specification Section 2: Canonical hierarchy `execution_root → Core → Repo → Agent`
- SPARC Specification Section 3: "Graph validation → agentics-execution-engine"
- SPARC Pseudocode Phase 8: `validateExecutionGraph()` function
- SPARC Completion Section 1 (Phase 8): Tests for valid graphs and each violation type
