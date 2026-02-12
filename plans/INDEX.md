# Canonical Execution Topology — Design Documents Index

**Source SPARC:** [SPARC-canonical-execution-topology.md](./SPARC-canonical-execution-topology.md)

---

## Architecture Decision Records (ADRs)

| ADR | Title | Scope | SPARC Phase |
|-----|-------|-------|-------------|
| [ADR-001](./adr/ADR-001-contract-schema-authority.md) | Contract Schema Authority | Fleet-wide | Phase 1 |
| [ADR-002](./adr/ADR-002-contract-validation-adapter.md) | Contract Validation Adapter Pattern | agentics-enforcement | Phase 1 |
| [ADR-003](./adr/ADR-003-cli-enforcement-gate.md) | CLI Enforcement Gate | agentics-cli | Phase 2 |
| [ADR-004](./adr/ADR-004-execution-id-minting-authority.md) | Execution ID Minting Authority | ruvector-service | Phase 3 |
| [ADR-005](./adr/ADR-005-simulation-engine-demotion.md) | Simulation Engine Demotion | agentics-simulation-engine | Phase 4 |
| [ADR-006](./adr/ADR-006-core-repository-assignment-model.md) | Immutable Core-to-Repository Assignment | Tier-3 Cores | Phase 5 |
| [ADR-007](./adr/ADR-007-cost-opacity-via-cost-reference.md) | Cost Opacity via CostReference | LLM-CostOps + fleet CI | Phase 6 |
| [ADR-008](./adr/ADR-008-execution-graph-hierarchy-validation.md) | Execution Graph Hierarchy Validation | agentics-execution-engine | Phase 8 |
| [ADR-009](./adr/ADR-009-mandatory-span-tracing.md) | Mandatory Span Tracing | Fleet-wide | Cross-cutting |
| [ADR-010](./adr/ADR-010-ci-static-enforcement-hooks.md) | CI Static Enforcement Hooks | Fleet-wide CI | Cross-cutting |

## Domain-Driven Design (DDD) Models

| DDD | Title | Bounded Contexts |
|-----|-------|------------------|
| [DDD-001](./ddd/DDD-001-bounded-contexts-map.md) | Bounded Contexts Map | All 7 contexts |
| [DDD-002](./ddd/DDD-002-execution-domain-model.md) | Execution Domain Model | Execution Authority, Execution Engine |
| [DDD-003](./ddd/DDD-003-enforcement-domain-model.md) | Enforcement Domain Model | Enforcement |
| [DDD-004](./ddd/DDD-004-cost-domain-model.md) | Cost Domain Model | Governance-Core, LLM-CostOps |
| [DDD-005](./ddd/DDD-005-observability-domain-model.md) | Observability Domain Model | Cross-cutting |

---

## Cross-Reference: ADRs → DDD Models

| ADR | Primary DDD Model |
|-----|-------------------|
| ADR-001 (Contract Schema Authority) | DDD-001 (Contract Context) |
| ADR-002 (Contract Validation Adapter) | DDD-003 (Enforcement Domain) |
| ADR-003 (CLI Enforcement Gate) | DDD-001 (CLI Context), DDD-003 (Enforcement Domain) |
| ADR-004 (Execution ID Minting) | DDD-002 (Execution Domain) |
| ADR-005 (Simulation Engine Demotion) | DDD-002 (Execution Domain) |
| ADR-006 (Core Assignment Model) | DDD-001 (Core Dispatch Context) |
| ADR-007 (Cost Opacity) | DDD-004 (Cost Domain) |
| ADR-008 (Graph Validation) | DDD-002 (Execution Domain) |
| ADR-009 (Span Tracing) | DDD-005 (Observability Domain) |
| ADR-010 (CI Hooks) | DDD-001 (all contexts — CI is fleet-wide) |

## Cross-Reference: SPARC Phases → Documents

| Phase | ADRs | DDD Models |
|-------|------|------------|
| Phase 1: Enforcement + Contract Integration | ADR-001, ADR-002 | DDD-001, DDD-003 |
| Phase 2: CLI Enforcement Gate | ADR-003 | DDD-001 |
| Phase 3: Ruvector Authority | ADR-004 | DDD-002 |
| Phase 4: Simulation Engine Demotion | ADR-005 | DDD-002 |
| Phase 5: Core Structure | ADR-006 | DDD-001 |
| Phase 6: Cost Authority | ADR-007 | DDD-004 |
| Phase 7: Foundational Alignment | ADR-010 | DDD-001, DDD-005 |
| Phase 8: Execution Graph Validation | ADR-008 | DDD-002 |
| Cross-cutting | ADR-009, ADR-010 | DDD-005 |
