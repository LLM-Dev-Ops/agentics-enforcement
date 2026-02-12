# ADR-004: Execution ID Minting Authority

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** ruvector-service (#46)
**SPARC Phase:** Phase 3

---

## Context

Execution IDs are the correlation key across the entire fleet. Every span, every result, every audit trail references an `execution_id`. If multiple services can mint execution IDs:

- There is no guaranteed uniqueness across the fleet.
- There is no single point to audit execution creation.
- Span trees cannot be rooted reliably.
- Services could self-authorize execution by minting their own IDs.

## Decision

**ruvector-service is the sole authority for minting execution IDs. No other service, repo, or component may generate an `execution_id`.**

### Endpoint

```
POST /v1/executions/accept
  Input:  ExecutionIntent (validated by enforcement prior to reaching ruvector)
  Output: AcceptanceResponse { execution_id, root_span_id, accepted }
```

### Minting Process

1. Receive validated ExecutionIntent.
2. Generate globally unique `execution_id`.
3. Create root span (`type="execution_root"`) with `execution_id`, timestamp, caller, intent_id.
4. Register in active execution registry.
5. Return `AcceptanceResponse`.

### Invariants

1. `execution_id` is ONLY generated inside `POST /v1/executions/accept`.
2. Every `execution_id` has exactly one root span.
3. All downstream spans MUST carry the `execution_id` minted by ruvector.
4. simulation-engine MUST call this endpoint and AWAIT acceptance before proceeding.
5. If ruvector rejects, no execution occurs. No ID is minted.

## Consequences

### Positive
- Single source of execution identity. No ambiguity about who created an execution.
- Root span is always created atomically with the ID, ensuring traceability from creation.
- Downstream services cannot self-authorize by fabricating IDs.
- Active execution registry enables fleet-wide execution visibility.

### Negative
- ruvector-service becomes a single point of failure for execution creation. If it's down, no execution can start.
- All execution creation paths must route through ruvector, even if they logically don't need the full service.

### Risks
- High throughput could bottleneck at ruvector's accept endpoint. Mitigation: ID minting is stateless and horizontally scalable.
- Clock skew could affect timestamp ordering. Mitigation: use monotonic IDs (e.g., ULIDs) rather than timestamp-only schemes.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| CLI mints execution_id | CLI is an entry point, not an authority. Moving minting to CLI loses the audit trail at the execution root. |
| Each service mints its own ID | Uniqueness guarantees break. Correlation becomes unreliable. |
| Execution engine mints ID | Engine is downstream of ruvector. Root span must exist before graph validation begins. |
| Distributed ID generation (Snowflake) | Adds complexity. Ruvector as single minter is simpler and sufficient for current scale. |

## Compliance

- SPARC Specification Section 2: ruvector-service is `[execution root — mints execution_id]`
- SPARC Specification Section 3: "Execution ID minting → ruvector-service — Only source of execution_id"
- SPARC Pseudocode Phase 3: `POST /v1/executions/accept` endpoint specification
- SPARC Specification Section 5: Root span type `execution_root` with required fields
