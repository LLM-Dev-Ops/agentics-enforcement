# ADR-005: Simulation Engine Demotion to Pure Delegation

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** agentics-simulation-engine (#44)
**SPARC Phase:** Phase 4

---

## Context

agentics-simulation-engine currently contains internal implementations for:

- Policy evaluation logic
- Cost calculation logic
- Artifact generation logic
- Validation math

This violates the canonical execution topology in multiple ways:

1. Policy evaluation belongs to Security-Core (via LLM-Policy-Engine).
2. Cost calculation belongs exclusively to LLM-CostOps (ADR-007).
3. Artifact generation belongs to the appropriate core's foundational repos.
4. Validation math belongs to the appropriate core's foundational repos.

The simulation engine is performing work that should be delegated to cores, bypassing the execution hierarchy.

## Decision

**agentics-simulation-engine is demoted to a pure delegation layer. ALL internal logic for policy, cost, artifact, and validation is removed. The engine delegates exclusively to Tier-3 Cores.**

### Retained Responsibilities

1. Await ruvector acceptance (`POST /v1/executions/accept`).
2. Walk the execution graph.
3. Resolve which Core handles each step.
4. Delegate to the resolved Core.
5. Collect and aggregate results.

### Removed Responsibilities

| Removed Logic | Delegated To |
|---|---|
| Policy evaluation | Security-Core → LLM-Policy-Engine |
| Cost calculation | Governance-Core → LLM-CostOps |
| Artifact generation | Appropriate Core → Appropriate foundational repo |
| Validation math | Appropriate Core → Appropriate foundational repo |

### Migration Path

1. Audit all internal policy/cost/artifact/validation logic in simulation-engine.
2. For each piece, identify the correct Core + foundational repo destination.
3. Create delegation calls to the correct Core.
4. Remove internal implementations.
5. Verify via regression tests that behavior is preserved through delegation.

## Consequences

### Positive
- Simulation engine becomes a thin orchestration layer, consistent with the hierarchy.
- Each concern is handled by its authoritative owner (cores/foundational repos).
- Eliminates duplicated logic between simulation engine and cores.
- Makes the execution graph truthful — what the graph shows is what actually executes.

### Negative
- Migration requires identifying and mapping every piece of internal logic. This is non-trivial.
- Additional network hops (engine → core → repo) adds latency compared to inline execution.
- Regression risk during migration. Mitigation: comprehensive regression tests before and after.

### Risks
- Incomplete identification of internal logic could leave orphaned implementations. Mitigation: static analysis scan for policy/cost/artifact/validation patterns.
- Cores may not yet be ready to accept delegated work. Mitigation: Phase 4 depends on Phase 5 (Core Structure) being at least partially complete.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Keep internal logic, add delegation as alternative path | Dual paths create ambiguity. Only one execution path should exist. |
| Move simulation engine above ruvector in hierarchy | Contradicts canonical hierarchy. Ruvector is the execution root. |
| Merge simulation engine into execution engine | Different concerns. Simulation engine manages graph walking; execution engine validates graph structure. |
| Gradual feature-flagged migration | Adds complexity. Clean cutover with regression tests is safer and simpler. |

## Compliance

- SPARC Specification Section 3: "Policy evaluation → Delegated to cores only — simulation-engine MUST NOT evaluate"
- SPARC Pseudocode Phase 4: `SimulationEngine.execute()` delegates only to cores
- SPARC Refinement Section 4: Migration path (5 steps)
