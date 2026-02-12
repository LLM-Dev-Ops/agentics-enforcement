# SPARC Specification: Canonical Execution Topology

**Scope:** System alignment across the entire Agentics fleet
**Constraint:** Wire enforcement, execution authority, and contract validation only. No new architecture. No new conceptual layers.

---

## S — Specification

### 1. Problem Statement

The Agentics fleet lacks a canonical, enforced execution hierarchy. Execution authority, contract validation, schema ownership, and span tracing are inconsistently applied across ~53 repositories. This specification defines the wiring needed to enforce a single execution topology from CLI entry through cores to foundational repos.

### 2. Execution Hierarchy (Canonical)

```
agentics-cli                         [entry gate]
  → agentics-enforcement             [invariant validation]
    → ruvector-service               [execution root — mints execution_id]
      → agentics-execution-engine    [graph validation]
        → Tier-3 Cores               [domain dispatch]
          → Foundational repos       [atomic work]
            → artifact/export        [output surfaces]
```

### 3. Authority Map

| Concern                | Authoritative Repo           | Rule                                      |
|------------------------|------------------------------|-------------------------------------------|
| Schema definitions     | agentics-contracts           | Dependency-free. Single source of truth.   |
| Invariant enforcement  | agentics-enforcement         | Consumes schemas FROM contracts.           |
| Execution ID minting   | ruvector-service             | Only source of execution_id.               |
| Graph validation       | agentics-execution-engine    | Enforces hierarchy: root→Core→Repo→Agent.  |
| Cost calculations      | LLM-CostOps                 | No other repo may compute cost.            |
| Policy evaluation      | Delegated to cores only      | simulation-engine MUST NOT evaluate.       |

### 4. Contract Schemas (Defined in agentics-contracts)

The following schemas are canonical and MUST NOT be duplicated:

| Schema               | Purpose                                              |
|----------------------|------------------------------------------------------|
| ExecutionIntent      | Declares what the caller wants to execute.            |
| ExecutionGraph       | DAG of execution steps with hierarchy constraints.    |
| CoreExecutionResult  | Standardized result envelope from any Core.           |
| EvidenceSummary      | Audit trail / proof-of-work from execution.           |
| PolicyDecision       | Result of policy evaluation (allow/deny + rationale). |
| CostReference        | Opaque cost handle — never raw numbers outside CostOps. |

### 5. Span Tracing Requirements

Every layer in the hierarchy MUST emit a span:

| Layer              | Span Type              | Required Fields                          |
|--------------------|------------------------|------------------------------------------|
| agentics-enforcement | contract_validation  | intent_id, schema_version, pass/fail     |
| ruvector-service   | execution_root         | execution_id, timestamp, caller          |
| Each Core          | core_execution         | core_name, execution_id, delegated_repos |
| Each Foundational  | repo_execution         | repo_name, core_parent, execution_id     |
| Each Agent         | agent_execution        | agent_id, repo_parent, execution_id      |

### 6. Phase Dependency Order

```
Phase 1: Enforcement + Contract Integration   [agentics-enforcement, agentics-contracts]
Phase 2: CLI Enforcement Gate                  [agentics-cli]
Phase 3: Ruvector Authority                    [ruvector-service]
Phase 4: Simulation Engine Demotion            [agentics-simulation-engine]
Phase 5: Core Structure                        [repos 27–34]
Phase 6: Cost Authority                        [LLM-CostOps]
Phase 7: Foundational Alignment                [repos 1–26]
Phase 8: Execution Graph Validation            [agentics-execution-engine]
```

### 7. Bypass Rules

| Bypass Condition          | What Is Bypassed               | What Is NOT Bypassed      |
|---------------------------|--------------------------------|---------------------------|
| Meta simulation (Tier-1)  | Enforcement rules              | Schema validation         |
| Meta simulation (Tier-1)  | Cost enforcement in CostOps   | Span emission             |
| No other bypasses exist   | —                              | —                         |

---

## P — Pseudocode

### Phase 1: Contract Validation Adapter (agentics-enforcement)

```
IMPORT schemas FROM agentics-contracts:
    ExecutionIntent
    ExecutionGraph
    CoreExecutionResult
    EvidenceSummary
    PolicyDecision
    CostReference

CLASS ContractValidationAdapter:

    FUNCTION enforceExecutionIntent(intent: ExecutionIntent) -> EnforcementResult:
        // Step 1: Contract validation FIRST
        validation = validateAgainstSchema(intent, ExecutionIntent.schema)
        IF validation.failed:
            EMIT span(type="contract_validation", result="fail", errors=validation.errors)
            RETURN EnforcementResult.blocked(reason="contract_schema_violation", errors=validation.errors)

        // Step 2: Apply enforcement rules
        policyResult = applyEnforcementRules(intent)
        IF policyResult.denied:
            EMIT span(type="contract_validation", result="policy_denied", reason=policyResult.reason)
            RETURN EnforcementResult.blocked(reason="enforcement_rule_violation", detail=policyResult)

        EMIT span(type="contract_validation", result="pass", intent_id=intent.id)
        RETURN EnforcementResult.allowed(intent_id=intent.id)

    FUNCTION validateAgainstSchema(data, schema) -> ValidationResult:
        // Validate structure, required fields, types against contract schema
        errors = schema.validate(data)
        RETURN ValidationResult(passed=errors.isEmpty(), errors=errors)

    FUNCTION applyEnforcementRules(intent: ExecutionIntent) -> PolicyDecision:
        // Evaluate business rules, rate limits, authorization
        FOR rule IN enforcementRules:
            decision = rule.evaluate(intent)
            IF decision.denied:
                RETURN decision
        RETURN PolicyDecision.allow()
```

### Phase 2: CLI Enforcement Gate (agentics-cli)

```
FUNCTION executeEnterprise(command, context) -> ExecutionResult:
    intent = buildExecutionIntent(command, context)

    IF context.isMetaSimulation:
        // Meta simulations bypass enforcement EXCEPT schema validation
        schemaResult = contractAdapter.validateAgainstSchema(intent, ExecutionIntent.schema)
        IF schemaResult.failed:
            RETURN ExecutionResult.error("Schema validation failed even for meta simulation")
        // Skip enforcement rules, proceed directly
    ELSE:
        // Full enforcement for all enterprise executions
        enforcementResult = enforcement.enforceExecutionIntent(intent)
        IF enforcementResult.blocked:
            DISPLAY enforcementResult.reason
            RETURN ExecutionResult.blocked(enforcementResult)

    // Proceed to ruvector-service
    RETURN forwardToRuvector(intent)
```

### Phase 3: Ruvector Execution Authority (ruvector-service)

```
ENDPOINT POST /v1/executions/accept (intent: ExecutionIntent) -> AcceptanceResponse:
    // Mint execution_id — this is the ONLY place execution_ids originate
    execution_id = generateExecutionId()

    // Create root span
    rootSpan = createSpan(
        type="execution_root",
        execution_id=execution_id,
        timestamp=now(),
        caller=intent.caller,
        intent_id=intent.id
    )

    // Register execution in active execution registry
    registry.register(execution_id, intent, rootSpan)

    RETURN AcceptanceResponse(
        execution_id=execution_id,
        root_span_id=rootSpan.id,
        accepted=true
    )

// simulation-engine MUST call this and AWAIT response before proceeding
```

### Phase 4: Simulation Engine Demotion (agentics-simulation-engine)

```
// REMOVE all internal implementations of:
//   - policy evaluation logic     → delegate to Security-Core
//   - cost calculation logic      → delegate to Governance-Core (LLM-CostOps)
//   - artifact generation logic   → delegate to appropriate Core
//   - validation math             → delegate to appropriate Core

CLASS SimulationEngine:

    FUNCTION execute(executionGraph: ExecutionGraph, execution_id: string):
        // Step 1: Await ruvector acceptance
        acceptance = AWAIT ruvector.accept(executionGraph.intent)
        IF NOT acceptance.accepted:
            RETURN ExecutionResult.rejected()

        // Step 2: Walk graph, delegate ONLY to cores
        FOR step IN executionGraph.steps:
            core = resolveCore(step)
            result = AWAIT core.execute(step, execution_id)
            collectResult(result)

        RETURN aggregateResults()

    // No internal policy, cost, artifact, or validation logic remains
```

### Phase 5: Core Structure

```
// Template for ALL cores (Security, Governance, Automation, Data)

CLASS Core:
    name: string
    assignedRepos: List<FoundationalRepo>

    FUNCTION execute(step, execution_id) -> CoreExecutionResult:
        // Create core-level span
        coreSpan = createSpan(
            type="core_execution",
            core_name=self.name,
            execution_id=execution_id,
            delegated_repos=self.assignedRepos.names()
        )

        // Dispatch ONLY to assigned foundational repos
        targetRepo = resolveRepo(step, self.assignedRepos)
        IF targetRepo NOT IN self.assignedRepos:
            FAIL("Core {self.name} cannot call repo {targetRepo.name}")

        // Foundational repo MUST create nested repo + agent spans
        result = AWAIT targetRepo.execute(step, execution_id, coreSpan.id)

        coreSpan.close(result.status)
        RETURN CoreExecutionResult.from(result)

// Core assignments (immutable):
SECURITY_CORE.assignedRepos   = [LLM-Shield, LLM-Policy-Engine, LLM-Incident-Manager]
GOVERNANCE_CORE.assignedRepos = [LLM-CostOps, LLM-Governance-Dashboard]
AUTOMATION_CORE.assignedRepos = [LLM-Orchestrator, LLM-Auto-Optimizer]
DATA_CORE.assignedRepos       = [LLM-Memory-Graph, LLM-Registry, LLM-Data-Vault]
```

### Phase 6: Cost Authority (LLM-CostOps)

```
// CI enforcement rule (lint / static analysis)
CI_RULE: "no-external-cost-calculation"
    SCAN all repos EXCEPT LLM-CostOps
    FLAG any code that:
        - performs arithmetic on currency/token values
        - defines cost schemas or cost types
        - imports cost calculation libraries
    EXEMPT: Tier-1 meta simulation contexts

// Runtime enforcement
CLASS CostOps:
    FUNCTION calculateCost(params) -> CostReference:
        // Only CostOps computes actual cost values
        rawCost = computeCost(params)
        // Return opaque reference, NOT raw numbers
        RETURN CostReference(
            ref_id=generateCostRefId(),
            computed_at=now(),
            // raw value stays internal to CostOps
        )

    FUNCTION resolveCostReference(ref: CostReference) -> CostDetail:
        // Only CostOps can dereference a CostReference
        RETURN lookupCost(ref.ref_id)
```

### Phase 7: Foundational Repo Alignment (repos 1–26)

```
// Template for ALL foundational repos

CLASS FoundationalRepo:
    name: string

    FUNCTION execute(step, execution_id, parent_span_id):
        // MUST emit repo-level span
        repoSpan = createSpan(
            type="repo_execution",
            repo_name=self.name,
            core_parent=parent_span_id,
            execution_id=execution_id
        )

        // MUST NOT orchestrate execution — only do atomic work
        // MUST NOT bypass Core layer — never call other repos directly
        result = doWork(step)

        // If using agents, they MUST create agent spans
        FOR agent IN step.agents:
            agentSpan = createSpan(
                type="agent_execution",
                agent_id=agent.id,
                repo_parent=repoSpan.id,
                execution_id=execution_id
            )
            agentResult = agent.run(step)
            agentSpan.close(agentResult.status)

        repoSpan.close(result.status)
        RETURN result

// LLM-Simulator: meta-only, does NOT participate in production execution hierarchy
```

### Phase 8: Execution Graph Validation (agentics-execution-engine)

```
FUNCTION validateExecutionGraph(graph: ExecutionGraph) -> ValidationResult:
    // Required hierarchy: execution_root → Core → Repo → Agent
    FOR node IN graph.nodes:
        IF node.type == "execution_root":
            ASSERT node.parent == NULL
            ASSERT node.children.ALL(child => child.type == "core")
        ELSE IF node.type == "core":
            ASSERT node.parent.type == "execution_root"
            ASSERT node.children.ALL(child => child.type == "repo")
        ELSE IF node.type == "repo":
            ASSERT node.parent.type == "core"
            ASSERT node.children.ALL(child => child.type == "agent")
        ELSE IF node.type == "agent":
            ASSERT node.parent.type == "repo"
            ASSERT node.children.isEmpty()
        ELSE:
            FAIL("Unknown node type: {node.type} — hierarchy violation")

    IF ANY assertion failed:
        RETURN ValidationResult.failed(violations)

    RETURN ValidationResult.passed()
```

---

## A — Architecture

### 1. System Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        agentics-cli                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  CLI Command Handler                                     │    │
│  │    → buildExecutionIntent()                              │    │
│  │    → enforcement.enforceExecutionIntent()  ◄── GATE      │    │
│  │    → forwardToRuvector()                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  agentics-enforcement   │
              │                         │
              │  ContractValidationAdapter
              │    ├─ validateAgainstSchema()
              │    │   (imports from agentics-contracts)
              │    └─ applyEnforcementRules()
              │                         │
              │  Emits: span(type="contract_validation")
              └────────────┬────────────┘
                           │
                           │  Schemas consumed (read-only):
              ┌────────────┴────────────┐
              │  agentics-contracts     │
              │  (DEPENDENCY-FREE)      │
              │                         │
              │  Defines:               │
              │   ExecutionIntent       │
              │   ExecutionGraph        │
              │   CoreExecutionResult   │
              │   EvidenceSummary       │
              │   PolicyDecision        │
              │   CostReference         │
              └─────────────────────────┘

              ┌─────────────────────────┐
              │  ruvector-service       │
              │  (EXECUTION ROOT)       │
              │                         │
              │  POST /v1/executions/accept
              │    → mints execution_id │
              │    → creates root span  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  agentics-execution-    │
              │  engine                 │
              │                         │
              │  Validates:             │
              │  root→Core→Repo→Agent   │
              └────────────┬────────────┘
                           │
          ┌────────┬───────┴───────┬────────┐
          ▼        ▼               ▼        ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Security │ │Governance│ │Automation│ │  Data    │
   │  Core    │ │  Core    │ │  Core    │ │  Core    │
   │          │ │          │ │          │ │          │
   │Shield    │ │CostOps   │ │Orchestr. │ │Mem-Graph │
   │PolicyEng │ │Gov-Dash  │ │AutoOpt   │ │Registry  │
   │IncMgr    │ │          │ │          │ │DataVault │
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 2. Dependency Graph (Directional — No Cycles Allowed)

```
agentics-contracts        ← dependency-free (leaf)
    ▲
    │ imports schemas
    │
agentics-enforcement      ← depends ONLY on agentics-contracts
    ▲
    │ calls enforceExecutionIntent()
    │
agentics-cli              ← depends on agentics-enforcement
    │
    │ forwards intent
    ▼
ruvector-service           ← depends on agentics-contracts (for schema types)
    │
    │ passes execution to
    ▼
agentics-execution-engine  ← depends on agentics-contracts
    │
    │ dispatches to
    ▼
Tier-3 Cores               ← depend on agentics-contracts
    │
    │ delegate to
    ▼
Foundational Repos (1–26)  ← depend on agentics-contracts (for types only)
```

### 3. Data Flow for a Single Execution

```
1. CLI receives command
2. CLI builds ExecutionIntent (schema from contracts)
3. CLI calls enforcement.enforceExecutionIntent(intent)
4. Enforcement validates intent against contract schema
5. Enforcement applies enforcement rules
6. Enforcement emits contract_validation span
7. CLI forwards intent to ruvector-service
8. Ruvector mints execution_id, creates root span
9. Ruvector returns acceptance to simulation-engine
10. Execution-engine validates ExecutionGraph hierarchy
11. Execution-engine dispatches to appropriate Core
12. Core creates core_execution span
13. Core delegates to assigned foundational repo(s)
14. Repo creates repo_execution span
15. Repo runs agents, each creating agent_execution span
16. Results bubble up: Agent → Repo → Core → Engine → CLI
```

### 4. Repository Modification Map

| Repo                         | Changes Required                                        |
|------------------------------|---------------------------------------------------------|
| agentics-contracts (#49)     | Define 6 canonical schemas. No dependencies added.       |
| agentics-enforcement (#53)   | Import schemas. Add ContractValidationAdapter. Emit spans.|
| agentics-cli (#43)           | Add enforcement gate before enterprise execution.        |
| ruvector-service (#46)       | Add POST /v1/executions/accept. Mint execution_id.       |
| agentics-simulation-engine (#44) | Remove policy/cost/artifact/validation logic. Delegate. |
| agentics-execution-engine (#52) | Add graph validation: root→Core→Repo→Agent.           |
| LLM-CostOps (#12)           | Add CI rule forbidding external cost calculations.       |
| Cores (#27–34)               | Add core-level span creation. Enforce repo assignments.  |
| Foundational repos (#1–26)   | Add repo-level spans. Remove orchestration logic.        |

---

## R — Refinement

### 1. Edge Cases and Failure Modes

| Scenario                                  | Handling                                                      |
|-------------------------------------------|---------------------------------------------------------------|
| Contract schema validation fails           | Block immediately. Return structured error. Emit fail span.   |
| Enforcement rules deny intent              | Block after schema passes. Emit policy_denied span.           |
| Ruvector is unreachable                    | CLI returns error. No execution_id minted. No execution.      |
| Ruvector rejects intent                    | Simulation-engine does not proceed. Returns rejection.        |
| Execution graph violates hierarchy         | execution-engine rejects graph. Returns violation list.       |
| Core attempts to call unassigned repo      | Core fails with explicit error identifying the violation.     |
| Foundational repo attempts orchestration   | Detected by graph validation. Rejected.                       |
| Cost calculation outside CostOps           | CI blocks the commit. Does not reach production.              |
| Meta simulation requests                   | Bypass enforcement rules. Schema validation still runs.       |
| Duplicate schema definition in enforcement | Build-time lint or CI check rejects. Must import from contracts.|

### 2. Schema Versioning Strategy

- agentics-contracts publishes schemas with semver.
- agentics-enforcement pins to a specific contracts version.
- Schema changes require version bump in contracts, then update in enforcement.
- Breaking schema changes require coordinated rollout across all consumers.

### 3. Span Correlation

All spans MUST carry `execution_id` from ruvector-service. Span hierarchy:

```
execution_root (ruvector)
  └─ contract_validation (enforcement)
  └─ core_execution (Core)
       └─ repo_execution (foundational repo)
            └─ agent_execution (agent)
```

Parent-child relationships enforced by passing `parent_span_id` down the call chain.

### 4. Migration Path for Simulation Engine Demotion

1. Identify all internal policy/cost/artifact/validation logic in simulation-engine.
2. For each piece of logic, identify the correct Core destination.
3. Create delegation calls to the correct Core.
4. Remove internal logic.
5. Verify via integration tests that behavior is preserved through delegation.

### 5. CI Enforcement Hooks

| Hook                          | Repo(s)              | Trigger        | Action                              |
|-------------------------------|----------------------|----------------|-------------------------------------|
| schema-duplication-check      | All except contracts | PR / push      | Reject if schemas duplicated        |
| cost-calculation-check        | All except CostOps   | PR / push      | Reject if cost math detected        |
| span-emission-check           | All execution repos  | PR / push      | Warn if span creation missing       |
| hierarchy-violation-check     | Foundational repos   | PR / push      | Reject if orchestration logic found |
| contract-import-check         | agentics-enforcement | PR / push      | Reject if schemas defined locally   |

### 6. Testing Strategy

| Test Type          | Scope                        | Validates                                       |
|--------------------|------------------------------|-------------------------------------------------|
| Contract unit      | agentics-contracts           | Schema validity, required fields, types          |
| Enforcement unit   | agentics-enforcement         | Schema validation + rule application             |
| Integration        | CLI → enforcement            | Gate blocks on failure, passes on success         |
| Integration        | ruvector acceptance flow     | execution_id minted, root span created            |
| Integration        | engine → core → repo         | Hierarchy maintained, spans emitted               |
| Graph validation   | agentics-execution-engine    | Invalid graphs rejected, valid graphs pass         |
| CI rule            | LLM-CostOps lint             | Cost calculations outside CostOps blocked         |
| End-to-end         | Full hierarchy               | CLI to foundational repo with all spans correct    |

---

## C — Completion

### 1. Deliverables Checklist

#### Phase 1 — Enforcement + Contract Integration
- [ ] agentics-contracts: Define `ExecutionIntent` schema
- [ ] agentics-contracts: Define `ExecutionGraph` schema
- [ ] agentics-contracts: Define `CoreExecutionResult` schema
- [ ] agentics-contracts: Define `EvidenceSummary` schema
- [ ] agentics-contracts: Define `PolicyDecision` schema
- [ ] agentics-contracts: Define `CostReference` schema
- [ ] agentics-contracts: Verify zero external dependencies
- [ ] agentics-enforcement: Import all 6 schemas from contracts
- [ ] agentics-enforcement: Implement `ContractValidationAdapter`
- [ ] agentics-enforcement: `enforceExecutionIntent()` validates schema THEN rules
- [ ] agentics-enforcement: Emit `contract_validation` span on every call
- [ ] agentics-enforcement: Remove/prevent any duplicate schema definitions
- [ ] agentics-enforcement: Unit tests for adapter (pass, schema-fail, rule-fail)

#### Phase 2 — CLI Enforcement Gate
- [ ] agentics-cli: Call `enforceExecutionIntent()` before any enterprise execution
- [ ] agentics-cli: Block execution on enforcement failure
- [ ] agentics-cli: Meta simulations bypass enforcement rules but not schema validation
- [ ] agentics-cli: Integration tests for gate behavior

#### Phase 3 — Ruvector Authority
- [ ] ruvector-service: Implement `POST /v1/executions/accept`
- [ ] ruvector-service: Mint `execution_id` on acceptance
- [ ] ruvector-service: Create root span on acceptance
- [ ] ruvector-service: simulation-engine awaits acceptance before proceeding
- [ ] ruvector-service: Unit + integration tests for acceptance endpoint

#### Phase 4 — Simulation Engine Demotion
- [ ] agentics-simulation-engine: Remove internal policy evaluation
- [ ] agentics-simulation-engine: Remove internal cost calculation
- [ ] agentics-simulation-engine: Remove internal artifact generation
- [ ] agentics-simulation-engine: Remove internal validation math
- [ ] agentics-simulation-engine: Add delegation calls to appropriate cores
- [ ] agentics-simulation-engine: Regression tests confirm behavior preserved

#### Phase 5 — Core Structure
- [ ] Each Core: Create core-level span on execution
- [ ] Each Core: Enforce that only assigned foundational repos are called
- [ ] Security-Core: Wired to LLM-Shield, LLM-Policy-Engine, LLM-Incident-Manager
- [ ] Governance-Core: Wired to LLM-CostOps, LLM-Governance-Dashboard
- [ ] Automation-Core: Wired to LLM-Orchestrator, LLM-Auto-Optimizer
- [ ] Data-Core: Wired to LLM-Memory-Graph, LLM-Registry, LLM-Data-Vault
- [ ] Each Core: Tests verify span emission and repo-assignment enforcement

#### Phase 6 — Cost Authority
- [ ] LLM-CostOps: CI rule blocks cost calculations in external repos
- [ ] LLM-CostOps: Cost represented as `CostReference` (opaque handle)
- [ ] LLM-CostOps: Tier-1 meta simulation exempt from CI rule
- [ ] LLM-CostOps: Tests for CI enforcement rule

#### Phase 7 — Foundational Alignment
- [ ] Repos 1–26: Each emits repo-level span
- [ ] Repos 1–26: None orchestrate execution
- [ ] Repos 1–26: None bypass Core layer
- [ ] LLM-Simulator: Confirmed meta-only
- [ ] CI hooks: hierarchy-violation-check active on all foundational repos

#### Phase 8 — Execution Graph Validation
- [ ] agentics-execution-engine: Validate `execution_root → Core → Repo → Agent`
- [ ] agentics-execution-engine: Fail graph if hierarchy breaks
- [ ] agentics-execution-engine: Tests for valid graphs, each violation type

### 2. Enforcement Hooks Summary

```
Pre-commit / CI:
  ├─ schema-duplication-check     → all repos except agentics-contracts
  ├─ cost-calculation-check       → all repos except LLM-CostOps
  ├─ span-emission-check          → all execution-participating repos
  ├─ hierarchy-violation-check    → foundational repos (1–26)
  └─ contract-import-check        → agentics-enforcement
```

### 3. Contract Validation Points

```
1. CLI → enforcement:          ExecutionIntent validated against schema
2. enforcement → rules:        ExecutionIntent validated against enforcement rules
3. ruvector acceptance:        Intent structure validated before minting execution_id
4. execution-engine:           ExecutionGraph validated for hierarchy compliance
5. Core dispatch:              Target repo validated against core assignment map
6. CI pipeline:                Schema duplication, cost locality, hierarchy violations
```

### 4. Updated Execution Flow (End-to-End)

```
USER
  │
  ▼
agentics-cli
  │ buildExecutionIntent()
  │ enforceExecutionIntent()          ← GATE (Phase 2)
  │   ├─ validate schema (contracts)  ← CONTRACT VALIDATION (Phase 1)
  │   └─ apply enforcement rules      ← ENFORCEMENT (Phase 1)
  │       emit span: contract_validation
  │
  ▼
ruvector-service
  │ POST /v1/executions/accept        ← AUTHORITY (Phase 3)
  │   ├─ mint execution_id
  │   └─ create root span
  │
  ▼
agentics-simulation-engine
  │ (delegates only, no internal logic) ← DEMOTED (Phase 4)
  │
  ▼
agentics-execution-engine
  │ validateExecutionGraph()           ← GRAPH VALIDATION (Phase 8)
  │   └─ enforce root→Core→Repo→Agent
  │
  ├──────────────┬──────────────┬──────────────┐
  ▼              ▼              ▼              ▼
Security-Core  Gov-Core    Auto-Core     Data-Core     ← CORES (Phase 5)
  │              │              │              │
  ▼              ▼              ▼              ▼
Shield        CostOps      Orchestrator  Memory-Graph   ← FOUNDATIONAL (Phase 7)
PolicyEng     Gov-Dash     AutoOpt       Registry
IncMgr                                   DataVault
  │
  ▼
Artifact / Export Surfaces
```

### 5. Modified Repos Summary

| #    | Repo                          | Modification Type                     |
|------|-------------------------------|---------------------------------------|
| 49   | agentics-contracts            | Add 6 canonical schemas               |
| 53   | agentics-enforcement          | Add ContractValidationAdapter + spans  |
| 43   | agentics-cli                  | Add enforcement gate                   |
| 46   | ruvector-service              | Add acceptance endpoint + execution_id |
| 44   | agentics-simulation-engine    | Remove internal logic, add delegation  |
| 52   | agentics-execution-engine     | Add graph hierarchy validation         |
| 12   | LLM-CostOps                  | Add CI cost-locality enforcement       |
| 27   | Security-Core                 | Add core span + repo assignment guard  |
| 28   | Governance-Core               | Add core span + repo assignment guard  |
| 29   | Automation-Core               | Add core span + repo assignment guard  |
| 30   | Data-Core                     | Add core span + repo assignment guard  |
| 1–26 | All foundational repos        | Add repo spans, remove orchestration   |
