# Dependency Map — Contract Schema Authority

**ADR:** ADR-001 (Contract Schema Authority)
**DDD:** DDD-001 (Bounded Contexts Map — Contract Context)

---

## Contract Context: Zero-Dependency Leaf

```
@agentics/contracts (src/contracts/)
├── ExecutionIntent       — declares what the caller wants to execute
├── ExecutionGraph        — DAG of execution steps with hierarchy constraints
├── CoreExecutionResult   — standardized result envelope from any Core
├── EvidenceSummary       — audit trail / proof-of-work from execution
├── PolicyDecision        — result of policy evaluation (allow/deny + rationale)
└── CostReference         — opaque cost handle (never raw numbers outside CostOps)

External dependencies: zod (runtime schema validation)
Internal dependencies: NONE (leaf node)
```

---

## Import Boundary Diagram

```
                    ┌───────────────────────────┐
                    │   @agentics/contracts      │
                    │   (ZERO-DEPENDENCY LEAF)    │
                    │                             │
                    │   6 canonical schemas        │
                    │   + Zod validation objects   │
                    └──────────┬────────────────────┘
                               │
              Published Language (read-only import)
                               │
        ┌──────────────────────┼──────────────────────────┐
        │                      │                          │
        ▼                      ▼                          ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│ Enforcement   │   │ Execution Engine │   │ CLI Context           │
│ Context       │   │ Context          │   │                       │
│               │   │                  │   │                       │
│ IMPORTS:      │   │ IMPORTS:         │   │ IMPORTS:              │
│ ExecutionIntent│  │ ExecutionGraph   │   │ ExecutionIntent       │
│ PolicyDecision│   │ CoreExecResult   │   │ (via enforcement)     │
│ (all 6 for    │   │ EvidenceSummary  │   │                       │
│  validation)  │   │                  │   │                       │
└───────────────┘   └──────────────────┘   └──────────────────────┘
        │                      │
        │                      ▼
        │           ┌──────────────────┐
        │           │ Core Dispatch    │
        │           │ Context          │
        │           │                  │
        │           │ IMPORTS:         │
        │           │ CoreExecResult   │
        │           │ CostReference    │
        │           │ EvidenceSummary  │
        │           └────────┬─────────┘
        │                    │
        │                    ▼
        │           ┌──────────────────┐
        │           │ Foundational     │
        │           │ Context          │
        │           │                  │
        │           │ IMPORTS:         │
        │           │ EvidenceSummary  │
        │           │ CostReference    │
        │           └──────────────────┘
        │
        ▼
┌───────────────────┐
│ Execution         │
│ Authority Context │
│ (ruvector)        │
│                   │
│ IMPORTS:          │
│ ExecutionIntent   │
│ EvidenceSummary   │
└───────────────────┘
```

---

## Schema-to-Consumer Matrix

| Schema | Enforcement | CLI | Exec Authority | Exec Engine | Core Dispatch | Foundational |
|--------|:-----------:|:---:|:--------------:|:-----------:|:-------------:|:------------:|
| ExecutionIntent | **R** | **R** | **R** | | | |
| ExecutionGraph | **R** | | | **R** | | |
| CoreExecutionResult | **R** | | | **R** | **R/W** | |
| EvidenceSummary | **R** | | **R** | **R** | **R** | **W** |
| PolicyDecision | **R** | | | | | |
| CostReference | **R** | | | | **R** | **R** |

**R** = reads/validates against schema, **W** = produces instances of this schema.

---

## Import Rules (Enforced by CI Hooks)

### Rule 1: Single Source of Truth
All 6 canonical schemas are defined in `src/contracts/` (future: `@agentics/contracts` package).
No other module, repo, or context may redefine them.

**Enforced by:** `scripts/schema-duplication-check.ts`
**Runs on:** All repos EXCEPT agentics-contracts
**Trigger:** PR / push
**Severity:** Block merge

### Rule 2: Import from Contracts Only
Within agentics-enforcement, all schema types must be imported from `src/contracts/` (or the future `@agentics/contracts` package). No local type definitions matching canonical names.

**Enforced by:** `scripts/contract-import-check.ts`
**Runs on:** agentics-enforcement only
**Trigger:** PR / push
**Severity:** Block merge

### Rule 3: Contracts Has Zero Internal Dependencies
`src/contracts/` must not import from any other `src/` directory.
Only external dependency allowed: `zod`.

**Enforced by:** structural review (verified at build time)
**Invariant:** No `../` imports in any `src/contracts/*.ts` file

---

## Repos Importing Contract Schemas

| Repo # | Repo Name | Schemas Consumed | Import Path |
|--------|-----------|------------------|-------------|
| 53 | agentics-enforcement | All 6 | `src/contracts/` (local, will become `@agentics/contracts`) |
| 43 | agentics-cli | ExecutionIntent | `@agentics/contracts` (peer dependency) |
| 46 | ruvector-service | ExecutionIntent, EvidenceSummary | `@agentics/contracts` |
| 52 | agentics-execution-engine | ExecutionGraph, CoreExecutionResult, EvidenceSummary | `@agentics/contracts` |
| 44 | agentics-simulation-engine | ExecutionGraph, CoreExecutionResult | `@agentics/contracts` |
| 27 | Security-Core | CoreExecutionResult, EvidenceSummary | `@agentics/contracts` |
| 28 | Governance-Core | CoreExecutionResult, CostReference, EvidenceSummary | `@agentics/contracts` |
| 29 | Automation-Core | CoreExecutionResult, EvidenceSummary | `@agentics/contracts` |
| 30 | Data-Core | CoreExecutionResult, EvidenceSummary | `@agentics/contracts` |
| 12 | LLM-CostOps | CostReference | `@agentics/contracts` |
| 1–26 | Foundational repos | EvidenceSummary, CostReference (varies) | `@agentics/contracts` |

---

## Version Contract

- Current contracts version: `0.1.0`
- Versioning: semver
- Breaking changes: require coordinated rollout across all consumers
- Version is exported as `CONTRACTS_VERSION` from the barrel
- CI hooks will check pinned version freshness (future enhancement)
