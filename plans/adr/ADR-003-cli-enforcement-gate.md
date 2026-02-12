# ADR-003: CLI Enforcement Gate

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** agentics-cli (#43)
**SPARC Phase:** Phase 2

---

## Context

agentics-cli is the entry point for all user-initiated execution. Today, execution requests flow from the CLI directly into downstream services without centralized pre-flight validation. This means:

- Malformed intents reach ruvector-service, which must handle rejection.
- Policy violations are caught late in the pipeline (or not at all).
- There is no single point where all enterprise executions are validated before resources are committed.

The CLI must become the mandatory enforcement gate.

## Decision

**agentics-cli MUST call `enforceExecutionIntent()` before forwarding ANY enterprise execution to ruvector-service. Execution is blocked on failure.**

### Gate Logic

```
1. CLI builds ExecutionIntent from command + context
2. IF context.isMetaSimulation:
     → Call validateAgainstSchema() ONLY (bypass enforcement rules)
     → Block on schema failure
3. ELSE:
     → Call enforceExecutionIntent() (full schema + rules)
     → Block on any failure
4. On success: forward intent to ruvector-service
```

### Invariants

1. No enterprise execution reaches ruvector without passing through the gate.
2. The gate is synchronous and blocking — execution does not proceed on failure.
3. Meta simulations (Tier-1) bypass enforcement rules but MUST still pass schema validation.
4. The gate delegates to agentics-enforcement; CLI does NOT implement validation logic itself.

## Consequences

### Positive
- Single enforcement point for all user-initiated execution.
- Fail-fast: invalid intents never consume downstream resources.
- Clear separation: CLI handles UX (display errors), enforcement handles validation logic.
- Meta simulation bypass is explicit and limited (schema validation still applies).

### Negative
- CLI now has a hard dependency on agentics-enforcement. If enforcement is unavailable, CLI cannot execute.
- Adds latency to every enterprise command (enforcement round-trip). Acceptable for enterprise workloads.

### Risks
- If the meta simulation bypass is misconfigured, it could allow unvalidated intents through. Mitigation: schema validation is always required regardless of bypass flag.
- If enforcement is down, all enterprise execution is blocked. Mitigation: this is the desired behavior — fail-closed, not fail-open.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Enforcement at ruvector-service instead of CLI | Moves validation deeper. Malformed intents still transit the network. CLI is the correct choke point. |
| Optional enforcement (warn but don't block) | Defeats the purpose of enforcement. Enterprise execution must be gated. |
| CLI-local validation rules | Duplicates enforcement logic. Single source of enforcement is agentics-enforcement. |
| Async enforcement (validate in background) | Race condition: execution could start before validation completes. Must be synchronous. |

## Compliance

- SPARC Specification Section 2: CLI is the `[entry gate]` in execution hierarchy
- SPARC Pseudocode Phase 2: `executeEnterprise()` function with meta-simulation branch
- SPARC Specification Section 7: Meta simulation bypass rules
