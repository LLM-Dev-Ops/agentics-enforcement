# ADR-006: Immutable Core-to-Repository Assignment Model

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** Tier-3 Cores (#27–34)
**SPARC Phase:** Phase 5

---

## Context

The Agentics fleet has 4 Tier-3 Cores that dispatch work to ~26 foundational repositories. Without explicit assignment rules:

- A Core could call any foundational repo, creating untracked lateral dependencies.
- Foundational repos could receive requests from multiple Cores with conflicting expectations.
- The execution graph becomes unpredictable — graph validation cannot enforce structure if bindings are dynamic.
- Ownership and accountability for foundational repos becomes unclear.

## Decision

**Each Core has an immutable, statically-defined list of assigned foundational repositories. A Core MUST NOT call any repo outside its assignment. Assignments are not configurable at runtime.**

### Assignment Map

| Core | Assigned Repositories |
|---|---|
| **Security-Core** | LLM-Shield, LLM-Policy-Engine, LLM-Incident-Manager |
| **Governance-Core** | LLM-CostOps, LLM-Governance-Dashboard |
| **Automation-Core** | LLM-Orchestrator, LLM-Auto-Optimizer |
| **Data-Core** | LLM-Memory-Graph, LLM-Registry, LLM-Data-Vault |

### Enforcement

1. Each Core maintains a static `assignedRepos` list (hardcoded, not configuration).
2. Before dispatching to a repo, the Core checks `targetRepo IN self.assignedRepos`.
3. If the check fails, the Core throws an explicit error: `"Core {name} cannot call repo {target}"`.
4. Execution graph validation (Phase 8) independently verifies that all core→repo edges match the assignment map.

### Core Execution Contract

Every Core MUST:
1. Create a `core_execution` span with `core_name`, `execution_id`, and `delegated_repos`.
2. Dispatch ONLY to assigned foundational repos.
3. Require that each foundational repo creates nested `repo_execution` and `agent_execution` spans.
4. Return a `CoreExecutionResult` (from agentics-contracts).

## Consequences

### Positive
- Execution graph is fully predictable and validatable.
- Clear ownership: each foundational repo has exactly one Core parent.
- Lateral dependencies between cores are impossible by construction.
- Graph validation can enforce structure without dynamic lookup.

### Negative
- Adding a new foundational repo requires updating the Core's assignment list (code change + deploy).
- Cross-cutting concerns that span multiple Cores require coordination (e.g., a security check that needs cost data must go Security-Core → Governance-Core, not Security-Core → LLM-CostOps directly).

### Risks
- If a foundational repo legitimately needs to be accessed by multiple Cores, the immutable model forces a design decision. Mitigation: this has not been identified as a current need. If it arises, the repo should be split or a shared service pattern introduced via contracts.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Dynamic assignment via configuration | Runtime configurability adds ambiguity. Assignment changes should be deliberate code changes. |
| Cores can call any repo | Defeats the purpose of hierarchy enforcement. Graph validation becomes impossible. |
| Foundational repos self-register with Cores | Inverts the authority model. Cores own the assignment, not repos. |
| Assignment defined in agentics-contracts | Contracts define schemas, not operational topology. Assignments are an execution concern. |

## Compliance

- SPARC Pseudocode Phase 5: Core class with `assignedRepos`, dispatch guard, and span emission
- SPARC Specification Section 2: `Tier-3 Cores → Foundational repos` hierarchy level
- SPARC Completion Section 1 (Phase 5): All 4 Cores wired to specific repos
