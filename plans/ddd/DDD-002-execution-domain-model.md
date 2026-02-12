# DDD-002: Execution Domain Model

**Bounded Contexts:** Execution Authority, Execution Engine
**Related ADRs:** ADR-004, ADR-005, ADR-008

---

## Domain Overview

The Execution domain governs the lifecycle of a single execution: from acceptance (ID minting) through graph validation, dispatch, and result aggregation. It spans two bounded contexts (Execution Authority and Execution Engine) but shares a unified domain model.

---

## Aggregates

### 1. Execution (Aggregate Root)

The central aggregate. Created when ruvector accepts an intent. Contains the full execution lifecycle state.

```
Execution [Aggregate Root]
├── execution_id: ExecutionId          [Identity — globally unique, minted by ruvector]
├── intent: ExecutionIntent            [Value Object — immutable after creation]
├── status: ExecutionStatus            [accepted | validating | dispatching | completed | failed]
├── root_span: Span                    [Entity — created atomically with execution]
├── graph: ExecutionGraph              [Entity — validated before dispatch]
├── results: List<CoreExecutionResult> [collected from cores]
├── created_at: Timestamp
└── caller: CallerId
```

**Invariants:**
- `execution_id` is set exactly once, at creation. Immutable thereafter.
- `root_span` is created atomically with the execution. No execution exists without a root span.
- `graph` must pass hierarchy validation before `status` can transition to `dispatching`.
- `results` can only be added by Cores (not by any other layer).

**Lifecycle:**
```
           accept()              validate()           dispatch()           complete()
[none] ──────────► [accepted] ──────────► [validating] ──────────► [dispatching] ──────────► [completed]
                        │                      │                        │
                        │                      │ fail()                 │ fail()
                        │                      ▼                        ▼
                        │                  [failed]                 [failed]
                        │
                        │ reject()
                        ▼
                   [rejected]
```

---

### 2. ExecutionGraph (Entity within Execution)

The DAG of execution steps, owned by the Execution aggregate.

```
ExecutionGraph [Entity]
├── nodes: List<GraphNode>
├── edges: List<GraphEdge>
└── validated: boolean

GraphNode [Value Object]
├── id: NodeId
├── type: NodeType            [execution_root | core | repo | agent]
├── name: string
├── parent_id: NodeId?        [null for root]
└── children_ids: List<NodeId>

GraphEdge [Value Object]
├── from: NodeId
└── to: NodeId
```

**Invariants (enforced by graph validation):**
- Exactly one node of type `execution_root`.
- `execution_root` has no parent; all its children are `core` type.
- `core` nodes have `execution_root` as parent; all their children are `repo` type.
- `repo` nodes have `core` as parent; all their children are `agent` type.
- `agent` nodes have `repo` as parent; no children.
- No unknown node types.
- No orphan nodes (every non-root node has exactly one parent).

---

## Value Objects

### ExecutionId
```
ExecutionId [Value Object]
├── value: string    [globally unique, format: ULID or UUID v7]
└── minted_by: "ruvector-service"   [always — never any other source]
```
- Immutable after creation.
- Equality by value.
- Created ONLY inside `POST /v1/executions/accept`.

### ExecutionIntent
```
ExecutionIntent [Value Object — defined in Contract Context]
├── id: string
├── caller: CallerId
├── action: string
├── target: string
├── parameters: Map<string, any>
├── metadata: IntentMetadata
└── is_meta_simulation: boolean
```
- Defined in agentics-contracts. Consumed read-only by this domain.
- Immutable once constructed by CLI.

### CoreExecutionResult
```
CoreExecutionResult [Value Object — defined in Contract Context]
├── core_name: string
├── execution_id: ExecutionId
├── status: ResultStatus     [success | failure | partial]
├── evidence: EvidenceSummary
├── cost_ref: CostReference?
└── outputs: Map<string, any>
```

### AcceptanceResponse
```
AcceptanceResponse [Value Object]
├── execution_id: ExecutionId
├── root_span_id: SpanId
└── accepted: boolean
```

---

## Domain Events

| Event | Triggered By | Payload | Consumers |
|---|---|---|---|
| `ExecutionAccepted` | ruvector mints ID | execution_id, intent_id, root_span_id, timestamp | Execution Engine, audit log |
| `ExecutionRejected` | ruvector rejects intent | intent_id, reason, timestamp | CLI (error display), audit log |
| `GraphValidationPassed` | Engine validates graph | execution_id, node_count | Dispatcher |
| `GraphValidationFailed` | Engine rejects graph | execution_id, violations[] | CLI (error display), audit log |
| `CoreDispatchStarted` | Engine dispatches to Core | execution_id, core_name, step_id | Span collector |
| `CoreResultReceived` | Core returns result | execution_id, core_name, result_status | Result aggregator |
| `ExecutionCompleted` | All core results collected | execution_id, final_status, evidence_summary | CLI, audit log |
| `ExecutionFailed` | Unrecoverable failure | execution_id, failure_reason, failed_at_layer | CLI, audit log, alerting |

---

## Domain Services

### ExecutionAcceptanceService
**Location:** ruvector-service
**Responsibility:** Accept or reject execution intents. Mint IDs. Create root spans.

```
ExecutionAcceptanceService
├── accept(intent: ExecutionIntent) → AcceptanceResponse
│     1. Validate intent is structurally sound (basic checks, not full enforcement)
│     2. Generate ExecutionId
│     3. Create root span
│     4. Register in active execution registry
│     5. Emit ExecutionAccepted event
│     6. Return AcceptanceResponse
│
└── reject(intent: ExecutionIntent, reason: string) → RejectionResponse
      1. Emit ExecutionRejected event
      2. Return RejectionResponse (no ID minted)
```

### GraphValidationService
**Location:** agentics-execution-engine
**Responsibility:** Validate execution graphs against the canonical hierarchy.

```
GraphValidationService
└── validate(graph: ExecutionGraph) → GraphValidationResult
      1. For each node, check parent-child type constraints
      2. Collect ALL violations (not just first)
      3. If violations: emit GraphValidationFailed, return failed result
      4. If clean: emit GraphValidationPassed, return passed result
```

### ExecutionDispatchService
**Location:** agentics-execution-engine / agentics-simulation-engine
**Responsibility:** Walk the validated execution graph and dispatch steps to Cores.

```
ExecutionDispatchService
└── dispatch(graph: ExecutionGraph, execution_id: ExecutionId) → AggregatedResult
      1. For each step in graph:
           a. Resolve target Core
           b. Emit CoreDispatchStarted event
           c. Await Core.execute(step, execution_id)
           d. Emit CoreResultReceived event
           e. Collect result
      2. Aggregate results
      3. Emit ExecutionCompleted or ExecutionFailed
      4. Return aggregated result
```

---

## Repositories (DDD sense)

| Repository Interface | Aggregate | Operations |
|---|---|---|
| `ExecutionRepository` | Execution | `save(execution)`, `findById(executionId)`, `findActive()` |
| `ExecutionGraphRepository` | ExecutionGraph (within Execution) | `save(graph)`, `findByExecutionId(executionId)` |

---

## Domain Rules

1. **Single Minting Rule:** `ExecutionId` is created only by `ExecutionAcceptanceService`. No other service, factory, or constructor may create one.
2. **Graph-Before-Dispatch Rule:** `ExecutionDispatchService` MUST NOT dispatch until `GraphValidationService` returns `passed`.
3. **Await-Acceptance Rule:** Simulation engine MUST call `accept()` and await the response before accessing the `execution_id`.
4. **Result-Ownership Rule:** Only Cores may add `CoreExecutionResult` entries to an Execution's results list.
5. **Immutable-Intent Rule:** `ExecutionIntent` is frozen at CLI construction time. No layer may modify it.
