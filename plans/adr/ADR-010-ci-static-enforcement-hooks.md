# ADR-010: CI Static Enforcement Hooks

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** Fleet-wide CI pipelines
**SPARC Phase:** Cross-cutting (Phases 1, 5, 6, 7)

---

## Context

Runtime enforcement catches violations at execution time. But many invariants can and should be caught earlier — at build time, before code is merged. Static enforcement via CI hooks provides:

- Shift-left detection: catch violations before deployment.
- Zero-latency enforcement: no runtime overhead for statically-checkable rules.
- Deterministic outcomes: same code always produces same CI result.

## Decision

**Six CI enforcement hooks are deployed across the fleet. Each hook runs on PR/push events and blocks merging on violation, except where the registry records a Warn severity.**

### Hook Registry

| Hook | Target Repos | Trigger | Action | Severity |
|---|---|---|---|---|
| `schema-duplication-check` | All repos EXCEPT agentics-contracts | PR / push | Reject if contract schemas are redefined locally | **Block** |
| `cost-calculation-check` | All repos EXCEPT LLM-CostOps | PR / push | Reject if cost arithmetic, cost types, or cost libraries detected | **Block** |
| `span-emission-check` | All execution-participating repos | PR / push | Warn if span creation calls are missing in execution paths | **Warn** |
| `hierarchy-violation-check` | Foundational repos (1–26) | PR / push | Reject if orchestration patterns detected (cross-repo calls, execution initiation) | **Block** |
| `contract-import-check` | agentics-enforcement | PR / push | Reject if schemas are defined locally instead of imported from contracts | **Block** |
| `claims-honesty-check` | All repos with a README | PR / push | Reject if a README status claim is unbacked per ADR-013 Rules 1–4 | **Warn** (**Block** from 2026-10-01) |

### Detection Patterns

**schema-duplication-check:**
- Scan for type/interface/class definitions matching canonical schema names: `ExecutionIntent`, `ExecutionGraph`, `CoreExecutionResult`, `EvidenceSummary`, `PolicyDecision`, `CostReference`.
- Exclude imports/references (only flag definitions).

**cost-calculation-check:**
- Scan for arithmetic operators on fields containing `cost`, `price`, `amount`, `fee`, `charge`.
- Scan for local type definitions containing `Cost` (excluding `CostReference` imports).
- Scan for imports of known cost calculation libraries.
- Exempt: files tagged with `@tier1-meta-simulation`.

**span-emission-check:**
- Scan execution path functions for `createSpan()` or equivalent calls.
- Warn (not block) if an execution handler lacks span creation.

**hierarchy-violation-check:**
- Scan foundational repos for patterns indicating orchestration: direct HTTP calls to other foundational repos, execution graph construction, `execution_id` generation.
- Exclude calls to the Core layer (those are legitimate).

**claims-honesty-check** (added by ADR-013):
- Rule 1: flag `img.shields.io/badge/` URLs whose metric segment is a measured quantity (`coverage`, `tests`, `rps`, `throughput`, `latency`, `uptime`, `build`) and whose value segment is a literal number, percentage, or `passing`.
- Rule 2: for READMEs claiming production readiness, flag unchecked `- [ ]` items under a gate/release/v1.0/production heading in `**/COMPLETION_ROADMAP.md`, `**/ROADMAP.md`, `**/*COMPLETION*.md`.
- Rule 3: flag a README containing both a placeholder-org token (`your-org`, `yourusername`, `your-username`, `yourorg`) and a production-readiness token.
- Rule 4: if a README asserts `build-passing` or "zero compilation errors", require a committed lockfile matching the repo's manifest type.
- Exempt: READMEs declaring `Status: Experimental`/`Alpha`/`WIP`; roadmaps annotated `@post-1.0-roadmap`.

**contract-import-check:**
- In agentics-enforcement only, verify that all 6 canonical schema types are imported from `agentics-contracts`, not defined in-repo.

### Exemptions

| Exemption | Scope | Mechanism |
|---|---|---|
| Tier-1 meta simulation | `cost-calculation-check` | File-level annotation `@tier1-meta-simulation` |
| Test files | All hooks | Glob exclusion `**/*.test.*`, `**/*.spec.*`, `**/test/**` |

## Consequences

### Positive
- Invariant violations caught at PR time, before code reaches production.
- No runtime overhead — checks are purely static.
- Fleet-wide consistency enforced automatically.
- New developers cannot accidentally violate invariants.

### Negative
- False positives may block legitimate code. Mitigation: pattern matchers should be precise; escape hatches via annotation for known exemptions.
- CI hooks add build time. Mitigation: hooks are lightweight text scanners, not full compilation.
- Maintaining 5 hooks across ~53 repos requires centralized hook management.

### Risks
- Overly aggressive pattern matching could block legitimate code. Mitigation: start with precise patterns, expand based on observed violations.
- Developers could rename variables to evade detection. Mitigation: code review remains a complementary check.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Runtime-only enforcement | Catches violations too late. Code is already deployed. |
| Manual code review only | Does not scale to ~53 repos. Humans miss patterns. |
| Linting rules (ESLint/custom) | Viable complement but not all checks fit linting models. CI hooks are more flexible. |
| Pre-commit hooks (local) | Can be skipped. CI hooks cannot be bypassed. |

## Compliance

- SPARC Refinement Section 5: All 5 CI hooks defined
- SPARC Completion Section 2: Enforcement hooks summary
- SPARC Specification Section 7: Tier-1 meta simulation exemption
