# ADR-001: Contract Schema Authority

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** Fleet-wide (all ~53 repositories)
**SPARC Phase:** Phase 1

---

## Context

The Agentics fleet operates across ~53 repositories with shared data structures passing between layers: CLI to enforcement, enforcement to ruvector, ruvector to execution engine, engine to cores, cores to foundational repos. Today, multiple repositories define their own versions of shared types (execution intents, policy decisions, cost structures), leading to:

- Schema drift between producers and consumers.
- Silent contract breakage when one repo changes a type definition.
- No single place to audit what the "correct" shape of fleet-wide data is.
- Duplicate type definitions that diverge over time.

## Decision

**agentics-contracts is the single, authoritative source for all fleet-wide schemas.**

Specifically:

1. agentics-contracts defines exactly 6 canonical schemas: `ExecutionIntent`, `ExecutionGraph`, `CoreExecutionResult`, `EvidenceSummary`, `PolicyDecision`, `CostReference`.
2. agentics-contracts MUST have zero external dependencies. It is a leaf node in the dependency graph.
3. Every other repository that needs these types MUST import them from agentics-contracts. No local redefinition.
4. Schema changes follow semver. Breaking changes require coordinated rollout.
5. A CI hook (`schema-duplication-check`) runs on all repos except agentics-contracts to reject PRs that redefine these schemas.

## Consequences

### Positive
- Single source of truth eliminates drift.
- Breaking changes are explicit (semver bump).
- CI enforcement makes violations impossible to merge.
- agentics-contracts being dependency-free means it can be consumed by any repo without transitive dependency risk.

### Negative
- All schema changes require a contracts PR first, then consumer updates. This adds coordination overhead.
- Repos cannot extend schemas locally; all extensions must go through contracts.

### Risks
- If agentics-contracts versioning is not strictly followed, consumers may pin to stale schemas. Mitigation: CI checks for pinned version freshness.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Each repo defines its own types | Schema drift is the core problem we're solving. |
| Shared types in agentics-enforcement | Enforcement is a consumer, not a definer. Coupling schemas to enforcement logic creates circular concerns. |
| Proto/gRPC shared definitions | Viable but adds toolchain dependency. Contracts as plain schemas (JSON Schema / TypeScript types) is simpler and sufficient. |
| Monorepo for all shared types | Organizational complexity too high for ~53 repos. Contracts as a standalone package is the minimal viable unit. |

## Compliance

- SPARC Specification Section 3 (Authority Map): "Schema definitions → agentics-contracts"
- SPARC Specification Section 4 (Contract Schemas): All 6 schemas listed
- SPARC Refinement Section 5 (CI Hooks): `schema-duplication-check`, `contract-import-check`
