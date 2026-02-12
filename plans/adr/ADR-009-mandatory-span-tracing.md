# ADR-009: Mandatory Span Tracing as Enforcement Mechanism

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** Fleet-wide (all execution-participating repos)
**SPARC Phase:** Cross-cutting (all phases)

---

## Context

The Agentics fleet operates across many services and repositories. Without mandatory observability:

- Execution failures are difficult to diagnose (which layer failed?).
- Enforcement decisions have no audit trail.
- The execution hierarchy cannot be verified at runtime.
- Cost attribution is impossible without tracing the full execution path.

Span tracing must be a first-class enforcement mechanism, not an optional observability add-on.

## Decision

**Every layer in the canonical execution hierarchy MUST emit a typed span with required fields. Span emission is mandatory and non-negotiable. A CI hook warns on missing span creation in execution-participating repos.**

### Span Type Registry

| Layer | Span Type | Required Fields | Emitting Repo |
|---|---|---|---|
| Enforcement | `contract_validation` | intent_id, schema_version, pass/fail | agentics-enforcement |
| Execution Root | `execution_root` | execution_id, timestamp, caller | ruvector-service |
| Core | `core_execution` | core_name, execution_id, delegated_repos | Tier-3 Cores |
| Foundational Repo | `repo_execution` | repo_name, core_parent, execution_id | Repos 1–26 |
| Agent | `agent_execution` | agent_id, repo_parent, execution_id | Repos 1–26 (agent subsystem) |

### Correlation

- ALL spans carry `execution_id` (minted by ruvector, ADR-004).
- Parent-child relationships are established by passing `parent_span_id` down the call chain.
- The resulting span tree mirrors the execution hierarchy: `execution_root → contract_validation / core_execution → repo_execution → agent_execution`.

### Invariants

1. Every execution produces at least: 1 `execution_root` + 1 `contract_validation` + N `core_execution` spans.
2. Spans are emitted regardless of success or failure. Failed executions still produce spans (with failure status).
3. Span types are a closed set — only the types listed above are valid.
4. Meta simulations still emit spans (bypass rules exempt enforcement rules, not span emission — see SPARC Section 7).

## Consequences

### Positive
- Complete audit trail for every execution, from entry to leaf.
- Execution hierarchy is verifiable at runtime by inspecting the span tree.
- Failure diagnosis is straightforward: find the span with the failure status.
- Cost attribution can trace through the span tree to the exact point of cost incurrence.

### Negative
- Span emission adds overhead to every operation. Acceptable for enterprise workloads.
- Span storage and querying infrastructure must scale with execution volume.
- Developers must remember to emit spans. Mitigated by CI hook (`span-emission-check`).

### Risks
- Spans could be emitted with incorrect parent IDs, creating orphaned or mislinked trees. Mitigation: graph validation (ADR-008) catches structural mismatches.
- High-volume executions could produce large span trees. Mitigation: span sampling can be applied at the collection layer without changing emission requirements.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Optional span emission | Gaps in tracing make the system unauditable. Must be mandatory. |
| Logging instead of spans | Logs lack structured parent-child relationships. Spans are purpose-built for hierarchical tracing. |
| Spans only on failure | Success-path tracing is equally important for audit and cost attribution. |
| Centralized span emission (single service) | Each layer must emit its own span. Centralizing would require forwarding all context to a single point, adding latency and coupling. |

## Compliance

- SPARC Specification Section 5: Full span type registry with required fields
- SPARC Refinement Section 3: Span correlation via `execution_id` and `parent_span_id`
- SPARC Refinement Section 5: `span-emission-check` CI hook
- SPARC Specification Section 7: Meta simulations still emit spans
