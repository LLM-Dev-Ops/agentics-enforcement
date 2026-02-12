# ADR-007: Cost Opacity via CostReference

**Status:** Accepted
**Date:** 2026-02-12
**Deciders:** Agentics Platform Team
**Scope:** LLM-CostOps (#12), fleet-wide CI
**SPARC Phase:** Phase 6

---

## Context

Cost calculation is a sensitive, complex domain that must produce consistent, auditable results. When cost logic is scattered across repositories:

- Different repos compute costs differently, producing inconsistent results.
- Raw cost values leak into business logic, creating tight coupling to cost models.
- Cost model changes require updating every repo that performs calculations.
- Audit trails for cost decisions are impossible to reconstruct.

## Decision

**LLM-CostOps is the sole authority for cost calculations. All other repos interact with costs ONLY through opaque `CostReference` handles. Raw cost values never leave CostOps.**

### CostReference Design

```
CostReference {
    ref_id: string      // Opaque identifier
    computed_at: timestamp
    // NO raw values — internal to CostOps only
}
```

- `CostReference` is defined in agentics-contracts (ADR-001).
- Only LLM-CostOps can create a `CostReference` (via `calculateCost()`).
- Only LLM-CostOps can dereference a `CostReference` (via `resolveCostReference()`).
- All other repos pass `CostReference` as an opaque token.

### CI Enforcement

A CI rule (`cost-calculation-check`) scans all repos except LLM-CostOps and flags:

1. Arithmetic on currency/token values.
2. Local definitions of cost schemas or cost types.
3. Imports of cost calculation libraries.

**Exemption:** Tier-1 meta simulation contexts are exempt from this CI rule.

### Runtime Flow

```
1. Core needs cost data → calls Governance-Core
2. Governance-Core → delegates to LLM-CostOps
3. LLM-CostOps.calculateCost(params) → returns CostReference
4. CostReference passed through the execution graph as opaque token
5. If any layer needs to display/use cost: calls LLM-CostOps.resolveCostReference()
```

## Consequences

### Positive
- Cost model changes are localized to LLM-CostOps. Zero impact on consumers.
- Raw values never leak into business logic, preventing accidental cost coupling.
- Full audit trail: every cost computation is traceable via `ref_id`.
- CI enforcement makes violations impossible to merge.

### Negative
- Every cost lookup requires a round-trip to CostOps (or Governance-Core). Cannot compute inline.
- Opaque handles cannot be compared, sorted, or aggregated outside CostOps. This is by design but may feel limiting.

### Risks
- High-frequency cost lookups could bottleneck CostOps. Mitigation: CostOps can cache internally; `ref_id` enables cache-friendly access patterns.
- Developers may try to work around opacity by encoding cost data in other fields. Mitigation: CI rule + code review.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Shared cost calculation library | Library still lets any repo compute costs. Doesn't solve consistency or audit. |
| Cost values as read-only fields | Values still leak. Any repo could copy and use them outside the intended flow. |
| Cost validation at runtime only | Allows violations to be written and deployed. CI prevention is stronger. |
| Cost service as a sidecar | Over-engineered. CostOps as a service behind Governance-Core is sufficient. |

## Compliance

- SPARC Specification Section 3: "Cost calculations → LLM-CostOps — No other repo may compute cost"
- SPARC Specification Section 4: `CostReference` schema defined in contracts
- SPARC Pseudocode Phase 6: CI rule `no-external-cost-calculation`, `CostOps` class
- SPARC Refinement Section 5: `cost-calculation-check` CI hook
