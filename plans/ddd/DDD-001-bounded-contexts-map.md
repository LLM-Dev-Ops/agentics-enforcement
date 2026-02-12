# DDD-001: Bounded Contexts Map

**Scope:** Entire Agentics Fleet
**Related ADRs:** All (ADR-001 through ADR-010)

---

## Overview

The Agentics fleet is decomposed into 7 bounded contexts. Each context has clear ownership, a well-defined ubiquitous language, and explicit relationships to other contexts. No context may reach into another's internals.

---

## Bounded Contexts

### 1. Contract Context
**Owner:** agentics-contracts (#49)
**Responsibility:** Define the canonical schemas that all other contexts consume.
**Contains:** `ExecutionIntent`, `ExecutionGraph`, `CoreExecutionResult`, `EvidenceSummary`, `PolicyDecision`, `CostReference`

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Schema | A versioned type definition that is the single source of truth for a data structure. |
| Contract | The agreement between producer and consumer about the shape and semantics of data. |
| CostReference | An opaque handle to a cost computation. Never contains raw values. |

**Relationships:**
- **Published Language** to all other contexts. Every context imports types from here.
- No upstream dependencies. This is a leaf node.

---

### 2. Enforcement Context
**Owner:** agentics-enforcement (#53)
**Responsibility:** Validate execution intents against contract schemas and business rules. Emit enforcement spans.
**Contains:** `ContractValidationAdapter`, enforcement rules, `EnforcementResult`

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Enforcement | The act of validating an intent against both schema and business rules before allowing execution. |
| ContractValidationAdapter | The component that orchestrates schema-first, rules-second validation. |
| EnforcementResult | The outcome of enforcement: `allowed` or `blocked` with reason. |
| Gate | The enforcement check that must pass before execution proceeds. |

**Relationships:**
- **Customer-Supplier** with Contract Context (supplier). Enforcement consumes schemas from contracts.
- **Upstream** to CLI Context. CLI calls enforcement and respects its decisions.

---

### 3. CLI Context
**Owner:** agentics-cli (#43)
**Responsibility:** User-facing entry point. Builds execution intents, enforces via gate, forwards to execution authority.
**Contains:** Command handlers, intent builder, enforcement gate integration, meta-simulation detection

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Enterprise Execution | Any non-meta-simulation execution initiated by a user. Subject to full enforcement. |
| Meta Simulation | A Tier-1 simulation that bypasses enforcement rules but not schema validation. |
| Intent Builder | The function that constructs an `ExecutionIntent` from CLI command and context. |
| Forward | The act of sending a validated intent to ruvector-service for acceptance. |

**Relationships:**
- **Customer-Supplier** with Enforcement Context (supplier). CLI calls `enforceExecutionIntent()`.
- **Customer-Supplier** with Execution Authority Context (supplier). CLI sends intents to ruvector.

---

### 4. Execution Authority Context
**Owner:** ruvector-service (#46)
**Responsibility:** Mint execution IDs, create root spans, register active executions, accept or reject execution requests.
**Contains:** Acceptance endpoint, ID generator, root span factory, active execution registry

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Execution ID | A globally unique identifier minted by ruvector-service. The correlation key for the entire execution. |
| Acceptance | The act of ruvector approving an execution and minting its ID. |
| Root Span | The top-level span created atomically with the execution ID. All other spans are descendants. |
| Active Execution Registry | The record of all currently-running executions. |

**Relationships:**
- **Customer-Supplier** with Contract Context (supplier). Uses `ExecutionIntent` schema for acceptance input.
- **Upstream** to Execution Engine Context. Engine consumes acceptance responses.
- **Downstream** from CLI Context. Receives forwarded intents.

---

### 5. Execution Engine Context
**Owner:** agentics-execution-engine (#52) and agentics-simulation-engine (#44)
**Responsibility:** Validate execution graphs against hierarchy rules, walk graphs, dispatch to Cores. Simulation engine delegates only (no internal logic).
**Contains:** Graph validator, graph walker, core resolver, result aggregator

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Execution Graph | A DAG of execution steps that must conform to the hierarchy: root → Core → Repo → Agent. |
| Graph Validation | The act of verifying that every node in the graph has correct parent-child type relationships. |
| Delegation | The simulation engine's sole remaining responsibility: forwarding work to Cores without internal processing. |
| Hierarchy Violation | Any graph edge that does not conform to the canonical node-type ordering. |

**Relationships:**
- **Customer-Supplier** with Contract Context (supplier). Uses `ExecutionGraph` and `CoreExecutionResult` schemas.
- **Customer-Supplier** with Execution Authority Context (supplier). Awaits acceptance before proceeding.
- **Upstream** to Core Dispatch Context. Dispatches validated graph steps to Cores.

---

### 6. Core Dispatch Context
**Owner:** Tier-3 Cores (#27–34): Security-Core, Governance-Core, Automation-Core, Data-Core
**Responsibility:** Receive dispatched execution steps, enforce repo assignments, delegate to foundational repos, emit core-level spans.
**Contains:** Core execution logic, static repo assignment maps, span factories

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Core | A domain-specific dispatch layer that owns a fixed set of foundational repos. |
| Assignment Map | The immutable, static list of foundational repos a Core is permitted to call. |
| Core Span | A `core_execution` span emitted by every Core on every dispatch. |
| Repo Guard | The check that ensures a Core only calls its assigned repos. |

**Relationships:**
- **Customer-Supplier** with Contract Context (supplier). Uses `CoreExecutionResult` schema.
- **Downstream** from Execution Engine Context. Receives dispatched steps.
- **Upstream** to Foundational Context. Delegates work to assigned repos.

**Core-to-Repo Assignments (immutable):**
```
Security-Core:    [Shield, PolicyEngine, IncidentManager]
Governance-Core:  [CostOps, GovernanceDashboard]
Automation-Core:  [Orchestrator, AutoOptimizer]
Data-Core:        [MemoryGraph, Registry, DataVault]
```

**Enforcement:**
Core-to-repo assignments are enforced at runtime by the Repo Guard
(`src/simulation-engine/repo-guard.ts`). The immutable assignment map
is defined in `src/simulation-engine/core-repo-assignments.ts` as a
frozen `ReadonlyMap`. The guard validates all repo nodes in the execution
graph against this map before any core delegation begins. Violations
fail the execution immediately with `RepoAssignmentViolationError`.

---

### 7. Foundational Context
**Owner:** Foundational repos (#1–26)
**Responsibility:** Perform atomic work. Emit repo-level and agent-level spans. Never orchestrate. Never bypass Core layer.
**Contains:** Domain-specific logic (security, cost, orchestration, data), agent subsystems

**Ubiquitous Language:**
| Term | Meaning |
|---|---|
| Foundational Repo | A repository that performs atomic, domain-specific work. It does not orchestrate other repos. |
| Repo Span | A `repo_execution` span emitted by every foundational repo on every execution. |
| Agent Span | An `agent_execution` span emitted by each agent within a repo. |
| Atomic Work | The indivisible unit of computation performed by a foundational repo. No sub-orchestration. |

**Relationships:**
- **Customer-Supplier** with Contract Context (supplier). Uses schema types for data exchange.
- **Downstream** from Core Dispatch Context. Receives work from its owning Core only.
- No lateral relationships. Foundational repos MUST NOT call each other.

---

## Context Map Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌──────────────────┐                                                   │
│  │ Contract Context  │◄── Published Language ──┐                        │
│  │ (agentics-        │                         │                        │
│  │  contracts)       │◄────────────────────────┤                        │
│  │                   │◄──────────────────┐     │                        │
│  │  Defines:         │◄────────────┐     │     │                        │
│  │  - ExecutionIntent│             │     │     │                        │
│  │  - ExecutionGraph │             │     │     │                        │
│  │  - CoreExecResult │             │     │     │                        │
│  │  - EvidenceSummary│             │     │     │                        │
│  │  - PolicyDecision │             │     │     │                        │
│  │  - CostReference  │             │     │     │                        │
│  └──────────────────┘             │     │     │                        │
│           ▲                       │     │     │                        │
│           │                       │     │     │                        │
│  ┌────────┴─────────┐   ┌────────┴──┐  │     │                        │
│  │ Enforcement Ctx   │   │ CLI Ctx   │  │     │                        │
│  │ (agentics-        │◄──│ (agentics-│  │     │                        │
│  │  enforcement)     │   │  cli)     │  │     │                        │
│  └──────────────────┘   └─────┬─────┘  │     │                        │
│                               │         │     │                        │
│                        ┌──────▼──────┐  │     │                        │
│                        │ Exec Auth   │──┘     │                        │
│                        │ Context     │        │                        │
│                        │ (ruvector)  │        │                        │
│                        └──────┬──────┘        │                        │
│                               │                │                        │
│                        ┌──────▼──────┐        │                        │
│                        │ Exec Engine │────────┘                        │
│                        │ Context     │                                  │
│                        │ (engine +   │                                  │
│                        │  simulator) │                                  │
│                        └──────┬──────┘                                  │
│                               │                                         │
│                        ┌──────▼──────┐                                  │
│                        │ Core        │                                  │
│                        │ Dispatch    │                                  │
│                        │ Context     │                                  │
│                        └──────┬──────┘                                  │
│                               │                                         │
│                        ┌──────▼──────┐                                  │
│                        │ Foundational│                                  │
│                        │ Context     │                                  │
│                        │ (repos 1-26)│                                  │
│                        └─────────────┘                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Context Relationship Types

| Upstream | Downstream | Relationship | Integration Pattern |
|---|---|---|---|
| Contract | Enforcement | Published Language | Schema import (package dependency) |
| Contract | Exec Authority | Published Language | Schema import (package dependency) |
| Contract | Exec Engine | Published Language | Schema import (package dependency) |
| Contract | Core Dispatch | Published Language | Schema import (package dependency) |
| Contract | Foundational | Published Language | Schema import (package dependency) |
| Enforcement | CLI | Customer-Supplier | Function call (`enforceExecutionIntent()`) |
| Exec Authority | CLI | Customer-Supplier | HTTP (`POST /v1/executions/accept`) |
| Exec Authority | Exec Engine | Customer-Supplier | Acceptance response passthrough |
| Exec Engine | Core Dispatch | Customer-Supplier | Function/RPC dispatch |
| Core Dispatch | Foundational | Customer-Supplier | Function/RPC delegation |

## Anti-Corruption Layers

| Boundary | ACL Required? | Reason |
|---|---|---|
| CLI → Enforcement | No | Same schema language (both consume from contracts). |
| CLI → Exec Authority | No | Same schema language. HTTP boundary provides natural separation. |
| Exec Engine → Core Dispatch | No | Same schema language. `CoreExecutionResult` is the integration type. |
| Core Dispatch → Foundational | Yes (lightweight) | Foundational repos may have internal types that differ from contract types. Cores translate to/from contract types at the boundary. |
