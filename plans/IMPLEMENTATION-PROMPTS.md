# Implementation Prompts — Canonical Execution Topology

**Source SPARC:** `plans/SPARC-canonical-execution-topology.md`
**Source ADRs:** `plans/adr/ADR-001` through `ADR-010`
**Source DDDs:** `plans/ddd/DDD-001` through `DDD-005`

Run these prompts **one at a time, in order**. Each prompt builds on the output of the previous one. Do not skip prompts or reorder them.

---

## Prompt 01 of 12 — Project Scaffolding

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

This is a TypeScript project. Scaffold the project with the following structure.
Do NOT implement any business logic yet — only project infrastructure.

Create:

1. package.json
   - name: "@agentics/enforcement"
   - version: "0.1.0"
   - type: "module"
   - main: "dist/index.js"
   - types: "dist/index.d.ts"
   - scripts: build (tsc), test (vitest run), test:watch (vitest), lint (eslint .)
   - dependencies: zod (for schema validation)
   - devDependencies: typescript, vitest, eslint, @types/node
   - peerDependencies: "@agentics/contracts" with version ">=0.1.0"
   - engines: { node: ">=20" }

2. tsconfig.json
   - target: ES2022
   - module: NodeNext
   - moduleResolution: NodeNext
   - strict: true
   - declaration: true
   - outDir: dist
   - rootDir: src
   - esModuleInterop: true
   - skipLibCheck: true
   - include: ["src"]

3. Directory structure (empty directories with .gitkeep):
   src/
   src/contracts/          — local contract type re-exports (simulates @agentics/contracts until it exists)
   src/domain/             — domain types, value objects, aggregates
   src/domain/events/      — domain event types
   src/services/           — domain services (ContractValidationAdapter, SchemaRegistry, RuleEngine)
   src/spans/              — span emission logic
   src/rules/              — built-in enforcement rules
   src/errors/             — custom error types
   src/__tests__/          — test files
   scripts/                — CI enforcement hook scripts

4. src/index.ts — empty file, will be the public API entry point

5. .gitignore — node_modules, dist, coverage, .env, *.tgz

6. Run: npm install

Acceptance criteria:
- npm run build succeeds (even though src/index.ts is empty, tsc should not error)
- npm test runs (vitest finds 0 tests, exits clean)
- Directory structure exists as specified
```

---

## Prompt 02 of 12 — Contract Schemas

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-001-contract-schema-authority.md
Reference: plans/ddd/DDD-001-bounded-contexts-map.md (Contract Context)
Reference: plans/ddd/DDD-002-execution-domain-model.md (ExecutionIntent, ExecutionGraph, CoreExecutionResult)
Reference: plans/ddd/DDD-004-cost-domain-model.md (CostReference)

The @agentics/contracts package does not exist yet. Implement the 6 canonical
contract schemas as a LOCAL MODULE inside src/contracts/ that will later be
extracted into its own package. This module must have ZERO internal dependencies
(it cannot import from any other src/ directory).

Create the following files:

1. src/contracts/execution-intent.ts
   ExecutionIntent interface with Zod schema:
   - id: string (required)
   - caller: string (required)
   - action: string (required)
   - target: string (required)
   - parameters: Record<string, unknown> (required, default {})
   - metadata: Record<string, unknown> (required, default {})
   - is_meta_simulation: boolean (required, default false)
   Export both the TypeScript interface AND the Zod schema object.

2. src/contracts/execution-graph.ts
   NodeType enum: "execution_root" | "core" | "repo" | "agent"
   GraphNode interface with Zod schema:
   - id: string
   - type: NodeType
   - name: string
   - parent_id: string | null
   - children_ids: string[]
   GraphEdge interface with Zod schema:
   - from: string
   - to: string
   ExecutionGraph interface with Zod schema:
   - nodes: GraphNode[]
   - edges: GraphEdge[]
   - validated: boolean (default false)

3. src/contracts/core-execution-result.ts
   ResultStatus enum: "success" | "failure" | "partial"
   CoreExecutionResult interface with Zod schema:
   - core_name: string
   - execution_id: string
   - status: ResultStatus
   - evidence: EvidenceSummary
   - cost_ref: CostReference | null
   - outputs: Record<string, unknown>

4. src/contracts/evidence-summary.ts
   EvidenceSummary interface with Zod schema:
   - execution_id: string
   - entries: EvidenceEntry[]
   EvidenceEntry interface:
   - timestamp: string (ISO 8601)
   - layer: string
   - action: string
   - detail: Record<string, unknown>

5. src/contracts/policy-decision.ts
   PolicyDecision interface with Zod schema:
   - decision: "allow" | "deny"
   - rationale: string
   - rule_id: string | null
   - evaluated_at: string (ISO 8601)

6. src/contracts/cost-reference.ts
   CostReference interface with Zod schema:
   - ref_id: string
   - computed_at: string (ISO 8601)

7. src/contracts/index.ts
   Barrel file: re-export ALL interfaces, ALL Zod schemas, and ALL enums
   from the 6 files above.

8. src/contracts/__tests__/contracts.test.ts
   Test every Zod schema:
   - Valid data parses successfully
   - Missing required fields throw ZodError
   - Wrong types throw ZodError
   - Default values are applied where specified

Acceptance criteria:
- src/contracts/ has zero imports from outside src/contracts/
- Every interface has a corresponding Zod schema export
- npm test passes with all contract tests green
- npm run build succeeds
```

---

## Prompt 03 of 12 — Enforcement Domain Types

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/ddd/DDD-003-enforcement-domain-model.md (Value Objects section)

Implement the enforcement domain's value objects and aggregate types.
These types IMPORT from src/contracts/ but do NOT duplicate contract schemas.

Create:

1. src/domain/enforcement-outcome.ts
   EnforcementOutcome enum: "allowed" | "blocked"

2. src/domain/schema-validation-result.ts
   SchemaError interface:
   - field: string
   - expected: string
   - actual: string
   - message: string
   SchemaValidationResult interface:
   - passed: boolean
   - schema_name: string
   - schema_version: string
   - errors: SchemaError[]
   Factory function: createPassedResult(schema_name, schema_version) → SchemaValidationResult
   Factory function: createFailedResult(schema_name, schema_version, errors) → SchemaValidationResult

3. src/domain/rule-evaluation-result.ts
   RuleEvaluationResult interface:
   - passed: boolean
   - rules_evaluated: number
   - rules_passed: number
   - failing_rule: string | null (rule_id of the failing rule)
   - policy_decision: PolicyDecision (import from contracts)

4. src/domain/block-reason.ts
   BlockPhase type: "schema_validation" | "rule_evaluation"
   BlockReason interface:
   - phase: BlockPhase
   - code: string
   - message: string
   - details: Record<string, unknown>

5. src/domain/enforcement-result.ts
   EnforcementResult interface:
   - outcome: EnforcementOutcome
   - intent_id: string
   - block_reason: BlockReason | null
   - decision_id: string
   Factory: createAllowed(intent_id, decision_id) → EnforcementResult
   Factory: createBlocked(intent_id, decision_id, block_reason) → EnforcementResult

6. src/domain/enforcement-decision.ts
   EnforcementDecision interface (the aggregate root):
   - decision_id: string
   - intent_id: string
   - schema_validation: SchemaValidationResult
   - rule_evaluation: RuleEvaluationResult | null
   - outcome: EnforcementOutcome
   - block_reason: BlockReason | null
   - span_emitted: boolean
   - evaluated_at: string (ISO 8601)
   - schema_version: string

7. src/domain/enforcement-rule.ts
   RuleResult interface:
   - passed: boolean
   - rule_id: string
   - reason: string | null
   EnforcementRule interface:
   - rule_id: string
   - name: string
   - description: string
   - priority: number
   - enabled: boolean
   - evaluate: (intent: ExecutionIntent) => RuleResult

8. src/domain/index.ts — barrel re-export of all domain types

9. src/domain/__tests__/domain-types.test.ts
   - Test factory functions produce correct shapes
   - Test createAllowed() sets outcome to "allowed" and block_reason to null
   - Test createBlocked() sets outcome to "blocked" with provided block_reason
   - Test createPassedResult() and createFailedResult()

Acceptance criteria:
- No contract schema types are redefined (only imported from src/contracts/)
- All factory functions are pure (no side effects)
- npm test passes
- npm run build succeeds
```

---

## Prompt 04 of 12 — Domain Events

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/ddd/DDD-003-enforcement-domain-model.md (Domain Events section)
Reference: plans/ddd/DDD-005-observability-domain-model.md (Domain Events section)

Implement a lightweight domain event system and the enforcement-specific events.

Create:

1. src/domain/events/event-bus.ts
   DomainEvent interface:
   - type: string
   - timestamp: string (ISO 8601)
   - payload: Record<string, unknown>
   EventHandler type: (event: DomainEvent) => void
   EventBus class:
   - subscribe(eventType: string, handler: EventHandler): void
   - emit(event: DomainEvent): void
   - clear(): void (removes all subscriptions — useful for testing)
   The EventBus is synchronous. Handlers are called in subscription order.
   Export a singleton defaultEventBus instance AND the class for testing.

2. src/domain/events/enforcement-events.ts
   Define typed event creator functions (each returns a DomainEvent):
   - createSchemaValidationPassed(intent_id, schema_version) → DomainEvent with type "SchemaValidationPassed"
   - createSchemaValidationFailed(intent_id, schema_version, errors: SchemaError[]) → DomainEvent with type "SchemaValidationFailed"
   - createRuleEvaluationPassed(intent_id, rules_evaluated) → DomainEvent with type "RuleEvaluationPassed"
   - createRuleEvaluationDenied(intent_id, failing_rule, reason) → DomainEvent with type "RuleEvaluationDenied"
   - createEnforcementDecisionMade(decision_id, intent_id, outcome: EnforcementOutcome) → DomainEvent with type "EnforcementDecisionMade"
   - createContractValidationSpanEmitted(decision_id, span_type, result) → DomainEvent with type "ContractValidationSpanEmitted"

3. src/domain/events/index.ts — barrel re-export

4. src/domain/events/__tests__/event-bus.test.ts
   - EventBus emits events to subscribed handlers
   - EventBus does not emit to unsubscribed event types
   - Multiple handlers for same event type all receive the event
   - clear() removes all subscriptions
   - Events have correct type and timestamp

5. src/domain/events/__tests__/enforcement-events.test.ts
   - Each creator function produces correct event type string
   - Each creator function includes timestamp
   - Payload contains all provided arguments

Acceptance criteria:
- EventBus is synchronous and deterministic
- All event creators produce well-formed DomainEvent objects
- npm test passes
- npm run build succeeds
```

---

## Prompt 05 of 12 — Schema Registry

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-001-contract-schema-authority.md
Reference: plans/adr/ADR-002-contract-validation-adapter.md
Reference: plans/ddd/DDD-003-enforcement-domain-model.md (SchemaRegistry service)

Implement the SchemaRegistry — the anti-corruption layer between enforcement
and the contract schemas.

Create:

1. src/services/schema-registry.ts
   SchemaRegistry class:
   - constructor() — loads all 6 Zod schemas from src/contracts/
   - getSchema(name: string): ZodSchema — returns the Zod schema by canonical name.
     Valid names: "ExecutionIntent", "ExecutionGraph", "CoreExecutionResult",
     "EvidenceSummary", "PolicyDecision", "CostReference"
     Throws SchemaNotFoundError if name is not in the set.
   - getSchemaVersion(): string — returns the current contracts version (hardcoded
     "0.1.0" for now, will come from package.json of @agentics/contracts later)
   - validateDependency(): boolean — verifies all 6 schemas are loadable.
     Returns true if all present, false if any missing.
   - validate(name: string, data: unknown): SchemaValidationResult —
     convenience method that calls getSchema(name), runs zod .safeParse(data),
     and converts the result into a SchemaValidationResult value object
     (from src/domain/schema-validation-result.ts).
     On success: returns createPassedResult(name, version)
     On failure: maps ZodError issues to SchemaError[] and returns createFailedResult(...)

2. src/errors/schema-not-found-error.ts
   SchemaNotFoundError extends Error:
   - name: "SchemaNotFoundError"
   - schema_name: string
   - available_schemas: string[]

3. src/services/__tests__/schema-registry.test.ts
   - getSchema("ExecutionIntent") returns a Zod schema
   - getSchema("Unknown") throws SchemaNotFoundError
   - getSchemaVersion() returns "0.1.0"
   - validateDependency() returns true (all 6 schemas present)
   - validate("ExecutionIntent", validData) returns passed SchemaValidationResult
   - validate("ExecutionIntent", {}) returns failed result with correct SchemaError entries
   - validate() maps Zod errors to SchemaError format (field, expected, actual, message)

Acceptance criteria:
- SchemaRegistry ONLY reads from src/contracts/ — no schema definitions
- validate() produces domain value objects, not raw Zod results
- SchemaNotFoundError includes available schema list for debugging
- npm test passes
- npm run build succeeds
```

---

## Prompt 06 of 12 — Rule Engine

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/ddd/DDD-003-enforcement-domain-model.md (RuleEngine service, EnforcementRule entity)

Implement the RuleEngine domain service and a set of starter enforcement rules.

Create:

1. src/services/rule-engine.ts
   RuleEngine class:
   - private rules: EnforcementRule[] (internal list)
   - addRule(rule: EnforcementRule): void — adds rule to the list
   - removeRule(ruleId: string): boolean — removes by rule_id, returns true if found
   - listRules(): EnforcementRule[] — returns copy sorted by priority (ascending)
   - evaluate(intent: ExecutionIntent): RuleEvaluationResult
     1. Filter to enabled rules only
     2. Sort by priority ascending (lower number = higher priority)
     3. For each rule: call rule.evaluate(intent)
     4. On first denial (passed === false): short-circuit, return RuleEvaluationResult
        with passed=false, failing_rule set, policy_decision with decision="deny"
     5. All pass: return RuleEvaluationResult with passed=true,
        policy_decision with decision="allow"
     Track rules_evaluated and rules_passed counts.

2. src/rules/intent-completeness-rule.ts
   A built-in rule (priority 100) that checks:
   - intent.id is non-empty
   - intent.caller is non-empty
   - intent.action is non-empty
   - intent.target is non-empty
   Returns denied if any field is empty string.

3. src/rules/action-allowlist-rule.ts
   A built-in rule (priority 200) that checks:
   - intent.action is in an allowlist of known actions
   - Default allowlist: ["simulate", "execute", "validate", "analyze", "export"]
   - Constructor accepts custom allowlist override
   Returns denied if action not in allowlist.

4. src/rules/index.ts — barrel export of built-in rules

5. src/services/__tests__/rule-engine.test.ts
   - Empty engine (no rules) returns passed with 0 rules evaluated
   - Single passing rule returns passed
   - Single failing rule returns failed with correct failing_rule
   - Multiple rules evaluated in priority order
   - Disabled rules are skipped (not counted in rules_evaluated)
   - Short-circuit: after first denial, remaining rules are not evaluated
     (verify by checking rules_evaluated count)
   - removeRule returns true for existing, false for non-existing
   - listRules returns copy sorted by priority

6. src/rules/__tests__/built-in-rules.test.ts
   - intent-completeness-rule passes for complete intent
   - intent-completeness-rule fails for empty id/caller/action/target
   - action-allowlist-rule passes for allowed action
   - action-allowlist-rule fails for unknown action
   - action-allowlist-rule respects custom allowlist

Acceptance criteria:
- Short-circuit behavior is tested and verified
- Priority ordering is tested
- Disabled rule skipping is tested
- Built-in rules are independently testable
- npm test passes
- npm run build succeeds
```

---

## Prompt 07 of 12 — Span Emission

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-009-mandatory-span-tracing.md
Reference: plans/ddd/DDD-005-observability-domain-model.md

Implement the span types and the SpanEmitter for enforcement's
contract_validation spans. Enforcement only emits one span type
(CONTRACT_VALIDATION) but the span model must be shared fleet-wide,
so define the full type system.

Create:

1. src/spans/span-types.ts
   SpanType enum: "execution_root" | "contract_validation" | "core_execution" |
                  "repo_execution" | "agent_execution"
   SpanStatus enum: "open" | "closed_success" | "closed_failure"

   Span interface:
   - span_id: string
   - parent_span_id: string | null
   - execution_id: string | null
     (null allowed because enforcement runs BEFORE ruvector mints execution_id;
      will be correlated after acceptance)
   - type: SpanType
   - status: SpanStatus
   - started_at: string (ISO 8601)
   - ended_at: string | null
   - attributes: Record<string, unknown>

   ContractValidationAttributes interface:
   - intent_id: string
   - schema_version: string
   - result: "pass" | "fail" | "policy_denied"

2. src/spans/span-emitter.ts
   SpanEmitter interface:
   - emit(span: Span): void

   InMemorySpanEmitter class (implements SpanEmitter):
   - private spans: Span[]
   - emit(span): pushes to internal array
   - getSpans(): returns copy of internal array
   - getSpansByType(type: SpanType): filtered list
   - clear(): empties the array
   This is the default implementation for testing and local dev.
   Production will swap in an OpenTelemetry-compatible emitter later.

   ConsoleSpanEmitter class (implements SpanEmitter):
   - emit(span): writes JSON to console.log with prefix "[SPAN]"

3. src/spans/enforcement-span-factory.ts
   createContractValidationSpan function:
   - Parameters: intent_id, schema_version, result ("pass"|"fail"|"policy_denied"),
     parent_span_id (optional, null by default)
   - Returns: a complete Span object with:
     - span_id: generated UUID
     - type: "contract_validation"
     - status: result === "pass" ? "closed_success" : "closed_failure"
     - started_at AND ended_at both set (enforcement spans are instantaneous/closed immediately)
     - attributes: ContractValidationAttributes
   - Uses crypto.randomUUID() for span_id generation

4. src/spans/index.ts — barrel re-export

5. src/spans/__tests__/span-emitter.test.ts
   - InMemorySpanEmitter stores emitted spans
   - getSpans() returns copies
   - getSpansByType() filters correctly
   - clear() empties stored spans

6. src/spans/__tests__/enforcement-span-factory.test.ts
   - Creates span with type "contract_validation"
   - Sets correct attributes (intent_id, schema_version, result)
   - "pass" result → closed_success status
   - "fail" result → closed_failure status
   - "policy_denied" result → closed_failure status
   - span_id is a valid UUID
   - started_at and ended_at are set

Acceptance criteria:
- SpanEmitter is an interface, not a concrete class (swappable)
- InMemorySpanEmitter is the test/dev default
- enforcement-span-factory produces fully-formed, closed spans
- execution_id is null on enforcement spans (not yet minted)
- npm test passes
- npm run build succeeds
```

---

## Prompt 08 of 12 — ContractValidationAdapter

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-002-contract-validation-adapter.md
Reference: plans/ddd/DDD-003-enforcement-domain-model.md (ContractValidationAdapter service)

This is the CORE domain service. It orchestrates the two-phase enforcement
pipeline: schema validation first, then rule evaluation.

Create:

1. src/services/contract-validation-adapter.ts
   ContractValidationAdapter class:
   Constructor parameters:
   - schemaRegistry: SchemaRegistry
   - ruleEngine: RuleEngine
   - spanEmitter: SpanEmitter

   Public methods:

   enforceExecutionIntent(intent: ExecutionIntent): EnforcementResult
     1. Generate decision_id (crypto.randomUUID())
     2. Phase 1: call this.validateAgainstSchema(intent)
     3. If schema validation failed:
        a. Create BlockReason with phase "schema_validation"
        b. Emit contract_validation span with result "fail"
        c. Emit domain events: SchemaValidationFailed, EnforcementDecisionMade
        d. Return EnforcementResult.blocked(...)
     4. Emit domain event: SchemaValidationPassed
     5. Phase 2: call this.applyEnforcementRules(intent)
     6. If rules denied:
        a. Create BlockReason with phase "rule_evaluation"
        b. Emit contract_validation span with result "policy_denied"
        c. Emit domain events: RuleEvaluationDenied, EnforcementDecisionMade
        d. Return EnforcementResult.blocked(...)
     7. Emit domain events: RuleEvaluationPassed, EnforcementDecisionMade
     8. Emit contract_validation span with result "pass"
     9. Return EnforcementResult.allowed(...)

   validateAgainstSchema(data: unknown): SchemaValidationResult
     Delegates to schemaRegistry.validate("ExecutionIntent", data).
     This method is PUBLIC — callable independently by CLI for meta-simulation
     schema-only validation (per ADR-003).

   applyEnforcementRules(intent: ExecutionIntent): RuleEvaluationResult
     Delegates to ruleEngine.evaluate(intent).

2. src/services/index.ts — barrel re-export of all services

3. src/services/__tests__/contract-validation-adapter.test.ts
   Test the full pipeline:

   Schema passes + rules pass → EnforcementResult.allowed
   - Verify outcome is "allowed"
   - Verify block_reason is null
   - Verify span emitted with result "pass"
   - Verify events: SchemaValidationPassed, RuleEvaluationPassed, EnforcementDecisionMade

   Schema fails → EnforcementResult.blocked
   - Verify outcome is "blocked"
   - Verify block_reason.phase is "schema_validation"
   - Verify span emitted with result "fail"
   - Verify rules were NOT evaluated (rules_evaluated should not appear)
   - Verify events: SchemaValidationFailed, EnforcementDecisionMade

   Schema passes + rules deny → EnforcementResult.blocked
   - Verify outcome is "blocked"
   - Verify block_reason.phase is "rule_evaluation"
   - Verify span emitted with result "policy_denied"
   - Verify events: SchemaValidationPassed, RuleEvaluationDenied, EnforcementDecisionMade

   validateAgainstSchema() is independently callable
   - Call it directly with valid data → returns passed result
   - Call it directly with invalid data → returns failed result
   - No span is emitted when called directly (spans only from enforceExecutionIntent)

   Span always emitted
   - On every code path through enforceExecutionIntent, exactly one span is emitted

Use InMemorySpanEmitter and EventBus for test assertions.

Acceptance criteria:
- Two-phase pipeline: schema ALWAYS before rules
- Span emitted on EVERY path (pass, schema-fail, rule-fail)
- validateAgainstSchema() is independently callable
- Domain events emitted at each decision point
- npm test passes
- npm run build succeeds
```

---

## Prompt 09 of 12 — Public API Surface

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-003-cli-enforcement-gate.md
Reference: plans/ddd/DDD-001-bounded-contexts-map.md (Enforcement Context external interface)

Wire up the public API that external consumers (agentics-cli) will import.

Create/Update:

1. src/index.ts — the public entry point
   Export:
   - createEnforcementService(config?: EnforcementConfig): EnforcementService
     Factory function that wires up SchemaRegistry, RuleEngine (with built-in rules),
     SpanEmitter, and ContractValidationAdapter.

   - EnforcementService interface:
     - enforceExecutionIntent(intent: ExecutionIntent): EnforcementResult
     - validateSchemaOnly(data: unknown): SchemaValidationResult
       (for meta-simulation use per ADR-003)
     - getSchemaVersion(): string
     - addRule(rule: EnforcementRule): void
     - removeRule(ruleId: string): boolean

   - EnforcementConfig interface:
     - spanEmitter?: SpanEmitter (default: InMemorySpanEmitter)
     - additionalRules?: EnforcementRule[]
     - skipBuiltInRules?: boolean (default: false)

   Re-export all public types:
   - From contracts: ExecutionIntent, ExecutionGraph, CoreExecutionResult,
     EvidenceSummary, PolicyDecision, CostReference (and their Zod schemas)
   - From domain: EnforcementResult, EnforcementOutcome, BlockReason,
     SchemaValidationResult, SchemaError, EnforcementRule, RuleResult
   - From spans: SpanEmitter, InMemorySpanEmitter, ConsoleSpanEmitter, Span, SpanType

   Do NOT export internal implementation classes (ContractValidationAdapter,
   SchemaRegistry, RuleEngine) — only the factory and interfaces.

2. src/__tests__/integration.test.ts
   Full integration test (no mocks — real wiring):

   - Create enforcement service with defaults
   - Send valid ExecutionIntent → allowed
   - Send intent missing required fields → blocked (schema_validation)
   - Send intent with invalid action → blocked (rule_evaluation)
   - Verify spans are emitted (use custom InMemorySpanEmitter via config)
   - Verify validateSchemaOnly() works independently
   - Verify addRule() adds a custom rule that fires
   - Verify removeRule() removes built-in rule
   - Verify getSchemaVersion() returns "0.1.0"

   Meta-simulation scenario:
   - Create intent with is_meta_simulation: true
   - Call validateSchemaOnly() → passes (schema is valid)
   - This proves CLI can gate meta-simulations with schema-only validation

Acceptance criteria:
- createEnforcementService() produces a fully wired, usable service
- Public API surface is minimal (only interfaces + factory + types)
- Internal classes are not leaked
- Integration tests pass with NO mocks
- npm test passes
- npm run build succeeds
```

---

## Prompt 10 of 12 — Execution Graph Validation

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-008-execution-graph-hierarchy-validation.md
Reference: plans/ddd/DDD-002-execution-domain-model.md (ExecutionGraph, GraphValidationService)

Implement execution graph hierarchy validation. Although this primarily
runs in agentics-execution-engine, the validation logic belongs alongside
the contracts and enforcement types since it enforces the canonical hierarchy.

Create:

1. src/services/graph-validation-service.ts
   GraphViolation interface:
   - node_id: string
   - node_type: string
   - violation: string (human-readable description)
   - expected: string
   - actual: string

   GraphValidationResult interface:
   - passed: boolean
   - violations: GraphViolation[]
   - node_count: number

   GraphValidationService class:
   - validate(graph: ExecutionGraph): GraphValidationResult
     Implementation:
     1. Find all nodes of type "execution_root". Exactly 1 must exist.
     2. For each node, validate parent-child constraints:
        - execution_root: parent_id must be null, all children must be "core"
        - core: parent must be "execution_root", all children must be "repo"
        - repo: parent must be "core", all children must be "agent"
        - agent: parent must be "repo", must have no children
     3. Check for unknown node types.
     4. Check for orphan nodes (non-root nodes with parent_id referencing
        a non-existent node).
     5. Collect ALL violations (do not stop at first).
     6. Return GraphValidationResult.

2. Update src/services/index.ts — add GraphValidationService export

3. Update src/index.ts — add to public API:
   - Export GraphValidationService, GraphValidationResult, GraphViolation
   - Add to EnforcementService interface:
     validateExecutionGraph(graph: ExecutionGraph): GraphValidationResult

4. src/services/__tests__/graph-validation-service.test.ts
   Valid graphs:
   - Simple: root → 1 core → 1 repo → 1 agent (passes)
   - Complex: root → 2 cores → 3 repos → 5 agents (passes)
   - Root with core only, no repos (passes — cores can have 0 children)

   Invalid graphs — each violation type:
   - No execution_root node → violation
   - Multiple execution_root nodes → violation
   - Root with repo child (skipping core) → violation
   - Core with agent child (skipping repo) → violation
   - Repo with core child (wrong direction) → violation
   - Agent with children → violation
   - Unknown node type → violation
   - Orphan node (parent_id references non-existent node) → violation
   - All violations collected (graph with 3 violations returns all 3)

Acceptance criteria:
- ALL violations collected, not just first
- Every constraint from SPARC Phase 8 is enforced
- Valid complex graphs pass
- Each violation type has a dedicated test
- npm test passes
- npm run build succeeds
```

---

## Prompt 11 of 12 — CI Enforcement Hook Scripts

```
You are implementing the agentics-enforcement repository.
Working directory: /workspaces/agentics-enforcement

Reference: plans/adr/ADR-010-ci-static-enforcement-hooks.md

Implement the CI enforcement hooks as standalone Node.js scripts that can be
run in any repo's CI pipeline. These scripts exit 0 on pass, exit 1 on violation.
They read from stdin or accept a directory path argument.

Create:

1. scripts/schema-duplication-check.ts
   Scans a directory for TypeScript/JavaScript files.
   Flags any file that DEFINES (not imports) interfaces or types named:
   ExecutionIntent, ExecutionGraph, CoreExecutionResult,
   EvidenceSummary