# DDD-005: Observability Domain Model

**Bounded Context:** Cross-cutting (all execution-participating contexts)
**Related ADRs:** ADR-004, ADR-009

---

## Domain Overview

The Observability domain defines the span tracing model that every layer in the execution hierarchy must follow. Unlike other domains which are localized to specific bounded contexts, observability is a cross-cutting concern — every context participates by emitting spans. The domain model defines the shared vocabulary, span types, correlation rules, and the invariants that make the span tree trustworthy.

---

## Aggregates

### 1. SpanTree (Aggregate Root)

Represents the complete trace for a single execution — the tree of all spans emitted from root to leaves.

```
SpanTree [Aggregate Root]
├── execution_id: ExecutionId          [Identity — correlates to the Execution aggregate]
├── root_span: Span                    [The execution_root span from ruvector]
├── spans: List<Span>                  [All spans in the tree, including root]
├── status: TreeStatus                 [building | complete | broken]
└── created_at: Timestamp
```

**Invariants:**
- Exactly one span of type `execution_root` exists per tree.
- Every non-root span has a `parent_span_id` that references an existing span in the tree.
- The span type hierarchy mirrors the execution hierarchy: root → contract_validation / core → repo → agent.
- A tree is `complete` when the execution finishes and all expected spans are accounted for.
- A tree is `broken` if orphan spans (no valid parent) or structural violations are detected.

---

## Entities

### Span

The fundamental unit of observability. Each span represents a single operation at one layer of the hierarchy.

```
Span [Entity]
├── span_id: SpanId                    [Identity — unique within the tree]
├── parent_span_id: SpanId?            [null for root span only]
├── execution_id: ExecutionId          [correlation — ALWAYS present]
├── type: SpanType                     [closed set of valid types]
├── status: SpanStatus                 [open | closed_success | closed_failure]
├── started_at: Timestamp
├── ended_at: Timestamp?               [null while open]
├── attributes: SpanAttributes         [type-specific required fields]
└── events: List<SpanEvent>            [optional timestamped annotations]
```

**Invariants:**
- `execution_id` is ALWAYS set. No span exists without an execution correlation.
- `parent_span_id` is null ONLY for `execution_root` type.
- `type` is from the closed set (see SpanType below).
- `status` transitions: `open` → `closed_success` | `closed_failure`. No other transitions.
- `started_at` is set at creation. `ended_at` is set when closed.

---

## Value Objects

### SpanType (Closed Enum)
```
SpanType [Value Object — enum]
├── EXECUTION_ROOT        [emitted by ruvector-service]
├── CONTRACT_VALIDATION   [emitted by agentics-enforcement]
├── CORE_EXECUTION        [emitted by Tier-3 Cores]
├── REPO_EXECUTION        [emitted by foundational repos]
└── AGENT_EXECUTION       [emitted by agents within foundational repos]
```

No other span types are valid. Unknown types indicate a hierarchy violation.

### SpanAttributes (Type-Specific Required Fields)

Each span type has specific required attributes:

```
ExecutionRootAttributes [Value Object]
├── execution_id: ExecutionId     [redundant with span.execution_id for clarity]
├── timestamp: Timestamp
├── caller: CallerId
└── intent_id: string

ContractValidationAttributes [Value Object]
├── intent_id: string
├── schema_version: string
└── result: "pass" | "fail" | "policy_denied"

CoreExecutionAttributes [Value Object]
├── core_name: string
├── execution_id: ExecutionId
└── delegated_repos: List<string>

RepoExecutionAttributes [Value Object]
├── repo_name: string
├── core_parent: SpanId          [the parent core's span ID]
└── execution_id: ExecutionId

AgentExecutionAttributes [Value Object]
├── agent_id: string
├── repo_parent: SpanId          [the parent repo's span ID]
└── execution_id: ExecutionId
```

### SpanEvent
```
SpanEvent [Value Object]
├── timestamp: Timestamp
├── name: string
└── attributes: Map<string, any>
```

Optional timestamped annotations on a span (e.g., "retry attempted", "cache miss").

### SpanId
```
SpanId [Value Object]
├── value: string    [unique within the span tree]
```

---

## Hierarchy Validation Rules

The span tree MUST mirror the execution hierarchy. Valid parent-child relationships:

| Parent Type | Valid Child Types |
|---|---|
| `execution_root` | `contract_validation`, `core_execution` |
| `core_execution` | `repo_execution` |
| `repo_execution` | `agent_execution` |
| `agent_execution` | (none — leaf node) |
| `contract_validation` | (none — leaf node) |

**Note:** `contract_validation` is a sibling of `core_execution` under `execution_root`, not a parent of it. Both are direct children of the root.

---

## Domain Events

| Event | Triggered By | Payload | Consumers |
|---|---|---|---|
| `SpanCreated` | Any layer creates a span | span_id, execution_id, type, parent_span_id | Span collector |
| `SpanClosed` | Any layer closes a span | span_id, execution_id, status, ended_at | Span collector |
| `SpanTreeCompleted` | Execution finishes, all spans closed | execution_id, span_count, tree_depth | Audit, analytics |
| `SpanTreeBroken` | Orphan or violation detected | execution_id, violation_type, details | Alerting, audit |

---

## Domain Services

### SpanFactory
**Creates spans with correct defaults and validation.**

```
SpanFactory [Domain Service]
├── createRootSpan(execution_id, caller, intent_id) → Span
│     type = EXECUTION_ROOT, parent_span_id = null
│
├── createContractValidationSpan(execution_id, parent_span_id, intent_id, schema_version) → Span
│     type = CONTRACT_VALIDATION
│
├── createCoreSpan(execution_id, parent_span_id, core_name, delegated_repos) → Span
│     type = CORE_EXECUTION
│
├── createRepoSpan(execution_id, parent_span_id, repo_name) → Span
│     type = REPO_EXECUTION
│
└── createAgentSpan(execution_id, parent_span_id, agent_id) → Span
      type = AGENT_EXECUTION
```

Each factory method:
1. Generates a unique `SpanId`.
2. Sets `started_at` to now.
3. Validates that required attributes are provided.
4. Emits `SpanCreated` event.

### SpanTreeValidator
**Validates a completed span tree for structural correctness.**

```
SpanTreeValidator [Domain Service]
└── validate(tree: SpanTree) → TreeValidationResult
      1. Verify exactly one EXECUTION_ROOT
      2. Verify all non-root spans have valid parent_span_id
      3. Verify parent-child type relationships match hierarchy rules
      4. Verify no orphan spans
      5. Return violations list (empty = valid)
```

---

## Repositories (DDD sense)

| Repository Interface | Aggregate/Entity | Operations |
|---|---|---|
| `SpanTreeRepository` | SpanTree | `save(tree)`, `findByExecutionId(executionId)` |
| `SpanRepository` | Span | `save(span)`, `findByExecutionId(executionId)`, `findByParentSpanId(spanId)` |

---

## Domain Rules

1. **Mandatory Emission Rule:** Every execution-participating layer MUST emit at least one span per execution. No exceptions, no opt-outs.
2. **Execution ID Correlation Rule:** Every span MUST carry the `execution_id` minted by ruvector. No span may use a locally-generated or missing execution ID.
3. **Parent Chain Rule:** Every non-root span MUST reference a valid `parent_span_id`. Orphan spans are structural violations.
4. **Closed Type Set Rule:** Only the 5 defined `SpanType` values are valid. No custom or ad-hoc span types.
5. **Failure Emission Rule:** Spans are emitted on both success and failure paths. A failed execution still produces a complete (or partially complete) span tree.
6. **Meta-Simulation Emission Rule:** Meta simulations bypass enforcement rules but MUST still emit spans. Span emission is never bypassed.
7. **Close-Before-Return Rule:** A span MUST be closed (success or failure) before the emitting function returns its result to the caller.

---

## Cross-Cutting Integration

Because observability is cross-cutting, each bounded context is responsible for emitting its own spans:

| Context | Spans It Emits | How |
|---|---|---|
| Enforcement | `contract_validation` | Via `ContractValidationAdapter` |
| Execution Authority | `execution_root` | Via `ExecutionAcceptanceService` |
| Core Dispatch | `core_execution` | Via Core.execute() |
| Foundational | `repo_execution`, `agent_execution` | Via FoundationalRepo.execute() |
| Execution Engine | (none directly — coordinates dispatch) | Passes parent_span_id down |

The Execution Engine context does not emit its own span type. It receives the `root_span_id` from ruvector and passes it as `parent_span_id` to the Cores it dispatches to.
