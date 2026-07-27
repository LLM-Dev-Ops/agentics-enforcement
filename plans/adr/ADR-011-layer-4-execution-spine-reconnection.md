# ADR-011: Layer-4 Execution Spine Reconnection

**Status:** Proposed
**Date:** 2026-07-27
**Deciders:** Agentics Platform Team
**Scope:** agentics-simulation-planner, agentics-simulation-runner, agentics-deployment-intent, agentics-execution-engine, agentics-orchestration-engine, agentics-cli
**SPARC Phase:** Phase 4

---

## Context

The intended Layer-4 chain is:

```
planner emits SimulationPlan → runner executes → results feed deployment-intent
    → execution-engine / orchestration-engine take over
```

A source audit of the four repos confirms the chain is severed in **five** places. Every claim below was verified by reading the files at the cited lines.

### Break 1 — Planner targets a repository that does not exist

`agentics-simulation-planner` hardcodes its downstream engine as the string literal
`'agentics-simulation-engine'`. There is no such directory in `/workspace/agentics-dev`
(the 55 top-level repos include `agentics-simulation-planner` and
`agentics-simulation-runner`, but no `agentics-simulation-engine`).

The literal is not a stray doc reference — it is a **compile-time type constraint**:

- `agentics-simulation-planner/src/types/simulation-plan.ts:266` — `readonly engine: 'agentics-simulation-engine';`
- `agentics-simulation-planner/src/types/simulation-scope.ts:120` — `readonly targetEngine: 'agentics-simulation-engine';`
- `agentics-simulation-planner/src/contracts/types.ts:13` — `readonly engine: 'agentics-simulation-engine';`
- `agentics-simulation-planner/src/contracts/validator.ts:268` — rejects any plan whose `engine` is not that literal
- `agentics-simulation-planner/src/core/simulation-plan-builder.ts:225` — default parameter `engine: 'agentics-simulation-engine'`
- `agentics-simulation-planner/src/server.ts:168` — advertises `service: 'agentics-simulation-engine'`
- `agentics-simulation-planner/README.md:37` — "It does NOT execute simulations — that's the responsibility of `agentics-simulation-engine`."

The phantom service has also leaked into the CLI:

- `agentics-cli/src/config/endpoints.ts:133` — an endpoint entry for `'agentics-simulation-engine'`
- `agentics-cli/src/commands/simulate.ts:451` — `loadEndpointConfig('agentics-simulation-engine')`
- `agentics-cli/src/commands/simulate.ts:455,460,467` — routes natural-language input to the phantom service via `/v1/simulate`, and only structured plan refs to the real runner via `/v1/runner`

Consequently **no SimulationPlan is ever delivered to `agentics-simulation-runner`**. The
runner's live endpoint accepts an unrelated flat shape — `{ simulationId, name, scenario, parameters }`
(`agentics-simulation-runner/src/server.ts:653-658`) — which carries no agents, no
integrations, and no execution graph.

### Break 2 — The runner's execute endpoint performs no work

`agentics-simulation-runner/src/server.ts:700-717`. After validation succeeds, the block
commented `--- Execute / queue the simulation ---` contains an **empty `try` body**:

```ts
let status: 'running' | 'completed' | 'failed' = 'running';
try {
  // Fire-and-forget style: the gateway tracks the execution.
  // For now we do a lightweight "queue" by recording the intent.
  // Full engine-backed execution can be wired via gateway.submitPlanToEngine.
  // This keeps latency low for the CLI caller.
} catch {
  status = 'failed';
}
```

`status` is therefore unconditionally `'running'`, and the endpoint returns
`{ simulationId, status: 'running', startedAt }` (line 716-717) without dispatching anything.
The `catch` is unreachable.

The endpoint then fabricates telemetry and fans it out to the Layer-3 cores
(`server.ts:719-735`):

- `server.ts:730` — `layersExecuted: ['validation', 'scheduling', 'dispatch']` is a **hardcoded literal**. None of those three layers ran.
- `server.ts:727-728` — `completedAt: new Date().toISOString()` and `durationMs: Date.now() - Date.parse(startedAt)` are computed inline microseconds after `startedAt` was set at line 701, yielding a near-zero duration that misrepresents a completed simulation.
- `fireFanout(fanoutCtx)` (line 734) ships this fabricated record to `INTELLIGENCE_CORE_URL`, `AUTOMATION_CORE_URL` and `DATA_CORE_URL`, with errors swallowed by `.catch(() => {})`.

This is the most severe finding: the platform's cores are being fed **synthetic evidence of
executions that never occurred**, which directly violates ADR-005 (mandatory evidence
validation) in agentics-execution-engine and undermines ADR-009 (mandatory span tracing).

### Break 3 — The runner's orchestration layer is mock-only, despite real clients existing

- `agentics-simulation-runner/src/orchestration/agent-resolver.ts:172-178` — `DefaultLLMClientFactory.createClient()` returns `new MockLLMClient(...)`, with the comment "In production, this would create real provider-specific clients (AnthropicClient, OpenAIClient, etc.)". `MockLLMClient.invoke()` (lines 141-158) returns the string `` `Mock response for prompt: ...` `` after a 10 ms `setTimeout`.
- `agentics-simulation-runner/src/orchestration/agent-resolver.ts:195` — this mock factory is the **default**: `config.llmClientFactory ?? new DefaultLLMClientFactory()`. Nothing in the server path supplies a real one.
- A **real factory already exists in the same repo**: `agentics-simulation-runner/src/surfaces/llm-client-factory.ts:133,137,141` instantiates `AnthropicClient`, `OpenAIClient` and `AzureOpenAIClient` from `src/surfaces/providers/`. It is exported (`src/surfaces/index.ts:288-293`) but **never imported by `src/orchestration/`** — the only mention in that directory is the comment at `agent-resolver.ts:175`.
- `agentics-simulation-runner/src/orchestration/connection-establisher.ts:134-147` — `MockSecureVault`'s constructor seeds hardcoded credentials `'mock-api-key-12345'` (line 141) and `'mock-bearer-token-67890'` (line 145).
- `connection-establisher.ts:149-159` — `resolveCredential()` never fails: unknown references return a synthesized `` `mock-resolved-${credentialRef}` ``.
- `connection-establisher.ts:161-170` — `isCredentialValid()` returns `true` for any unknown reference ("Assume valid in mock mode").
- `connection-establisher.ts:311-312` — both mocks are the **production defaults**: `config.secureVault ?? new MockSecureVault()` and `config.adapterFactory ?? new DefaultAdapterFactory()`, where `DefaultAdapterFactory.create()` returns `new MockIntegrationAdapter(...)` (line 252).

So even once Break 2 is fixed, the resolver would connect to nothing and every agent would
answer with mock text — while credential validation silently passes.

### Break 4 — orchestration-engine hardwires mock cores in the production server

`agentics-orchestration-engine/src/server.ts:610` — inside the `/v1/simulate` handler:

```ts
const ruvectorClient = createRuvectorClientFromEnv();
const coreClients = createMockCoreClientRegistry();
engine.initialize(ruvectorClient, coreClients);
```

The Ruvector client is built from environment configuration, but the core registry is
**unconditionally mock** — imported at `src/server.ts:20` from
`./integration/cores/mock-cores.js`, defined at
`src/integration/cores/mock-cores.ts:417`. There is no env-gated or real alternative in the
server path. The same mock default is baked into the listener:
`src/ruvector/execution-listener.ts:143` — `this.coreClients = coreClients ?? createMockCoreClientRegistry()`.

The real Security / Data / Governance / Automation Layer-3 cores are therefore **never
invoked in production**, while the endpoint still writes a result packet to
`RESULTS_INDEX_URL` (`src/server.ts:649-656`) that passes `validateResultPacket` and is
recorded as a genuine run.

### Break 5 — `plan_approved` has two subscribers, one dead publisher loop, and three incompatible payload shapes

**Duplicate subscription.** Both engines subscribe to the same Ruvector event with no
documented arbitration:

- `agentics-execution-engine/src/execution_listener.ts:24` — `this.ruvectorClient.subscribe('plan_approved', ...)`
- `agentics-orchestration-engine/src/ruvector/client.ts:420-421` — `url.searchParams.set('types', 'plan_approved')`, consumed by `src/ruvector/execution-listener.ts:230` and deployed as a separate service (`README.md:93`, `src/ruvector/startup.ts:182`).

**The execution-engine's subscription is dead code.**
`agentics-execution-engine/src/ruvector_client.ts:39-52`:

```ts
async subscribe(event: string, handler: (payload: unknown) => void): Promise<void> {
  const url = `${this.serviceUrl}/v1/subscribe`;
  const res = await fetch(url, { method: 'POST', /* ... */
    body: JSON.stringify({ client_id: this.clientId, event }) });
  if (!res.ok) throw new Error(`Ruvector subscribe failed: ...`);
}
```

The `handler` parameter is **never stored, never registered, and never invoked** — there is
no handler map on the class (fields are only `serviceUrl`, `apiKey`, `clientId`, `connected`,
lines 8-11), no polling loop, and no inbound HTTP route. The POST body does not even include
a callback URL. `handlePlanApproved` (`execution_listener.ts:47`) — and with it the entire
`dispatchExecution` path at line 64 — is therefore **unreachable**.

**orchestration-engine both publishes and subscribes to `plan_approved`.**
`agentics-orchestration-engine/src/server.ts:737-753` — `POST /api/v1/runs` mints its own
`runId` (line 727) and publishes `{ type: 'plan_approved', runId, source: 'orchestration', ... }`
to `${RUVECTOR_SERVICE_URL}/events/decisions`. Its own listener then filters for exactly that
event type. A service that publishes and subscribes to the same event is a self-trigger loop.
Self-minting `runId` and self-declaring approval also conflicts with **ADR-004**, which makes
ruvector-service the sole authority that accepts and mints execution identity.

**Three mutually incompatible payload shapes** for one event name:

| # | Producer / consumer | Expected shape | Citation |
|---|---|---|---|
| 1 | orchestration **publishes** | `{ type, runId, source, timestamp, payload }` | `agentics-orchestration-engine/src/server.ts:737-743` |
| 2 | orchestration **consumes** | `PlanApprovedEvent { type, simulation_id, plan_id, execution_profile }` | `agentics-orchestration-engine/src/ruvector/types.ts:104-116`, guard at `:265-269` |
| 3 | execution-engine **consumes** | payload *is* an `ExecutionIntent`, keyed on `intent_id` | `agentics-execution-engine/src/execution_listener.ts:50-52` |

Shape 1 satisfies neither 2 nor 3. Even if the execution-engine's `subscribe()` were repaired,
`intent.intent_id` would be `undefined` against shape 1 and every event would hit the
`skipping` branch at `execution_listener.ts:52`.

### Why this matters

Layers 1-3 report success end-to-end. Break 2 manufactures the evidence, Break 4 records it
against mock cores, and Break 5 guarantees the one component that would produce a real
execution graph is never triggered. The platform is **green by construction**.

## Decision

We adopt **one** canonical Layer-4 topology. Ruvector is the only decision authority, and
each event has exactly one publisher and one subscriber.

### Canonical topology

```
agentics-cli
  │  1. enforceExecutionIntent()                                  [ADR-003]
  │  2. POST ruvector /v1/executions/accept → execution_id        [ADR-004]
  ▼
agentics-simulation-planner
  │  POST /v1/plan → SimulationPlan { targetEngine: 'agentics-simulation-runner' }
  ▼
agentics-simulation-runner            ◄── SOLE consumer of SimulationPlan
  │  POST /v1/runner/plans { execution_id, parent_span_id, plan }
  │  · AgentResolver      → REAL LLM clients (surfaces/llm-client-factory)
  │  · ConnectionEstablisher → REAL vault + REAL adapters
  │  · emits OBSERVED layersExecuted, never a literal
  ▼
agentics-deployment-intent
  │  POST /v1/intent  (simulation results → deployment intent)
  │  POST ruvector /v1/executions/{id}/decision  → requests approval
  ▼
ruvector-service                      ◄── SOLE publisher of plan_approved
  │  emits plan_approved (canonical envelope)
  ▼
agentics-execution-engine             ◄── SOLE subscriber of plan_approved
  │  walks execution graph, topological batch dispatch          [its ADR-002]
  │  dispatches to Layer-3 cores, publishes execution_started / _completed
  ▼
agentics-orchestration-engine         ◄── synchronous delegation service only
     POST /v1/simulate with REAL core clients; NO event subscription
```

### Decision 1 — The planner's target engine is `agentics-simulation-runner`

`agentics-simulation-engine` does not exist and will not be created. ADR-005 demoted that
component to pure delegation; the surviving implementation of that role is
`agentics-simulation-runner`. Every occurrence of the literal
`'agentics-simulation-engine'` is retargeted to `'agentics-simulation-runner'`.

### Decision 2 — The runner accepts a SimulationPlan on a dedicated endpoint

A new `POST /v1/runner/plans` accepts `{ execution_id, parent_span_id, plan: SimulationPlan }`.
The existing flat `POST /v1/runner` is marked **deprecated** and retained for one release for
CLI compatibility, but it MUST NOT fan out to cores (see Decision 3).

### Decision 3 — Fanout requires observed evidence; fabrication is forbidden

`layersExecuted`, `durationMs` and `completedAt` MUST be derived from the actual pipeline
result. A handler that did not execute a plan MUST NOT call `fireFanout`. This is a
platform-wide invariant enforceable by the CI hooks of ADR-010.

### Decision 4 — Mocks may never be a default in a server path

`??`-defaulting to a mock implementation is prohibited in any code reachable from a server
entrypoint. Real implementations are constructed from environment configuration; if that
configuration is absent, the service **fails closed at startup** rather than silently
substituting a mock. Mock factories remain exported for tests only.

### Decision 5 — `agentics-execution-engine` owns the `plan_approved` trigger

**`agentics-execution-engine` is the sole subscriber to `plan_approved`.
`agentics-orchestration-engine` MUST NOT subscribe to, nor publish, `plan_approved`.**

Rationale:

1. `plan_approved` means "a plan is approved; produce an execution graph and dispatch it".
   That is precisely the execution-engine's chartered role — its own ADR-002 (topological
   batch dispatch) and ADR-006 (execution graph always produced).
2. orchestration-engine is today the *publisher* (`src/server.ts:737-743`). Publisher and
   subscriber cannot be the same service without a self-trigger loop.
3. orchestration-engine self-minting `runId` and self-declaring approval violates ADR-004.
   Decision authority belongs to ruvector.
4. orchestration-engine's remaining value — synchronous `/v1/simulate` core delegation — needs
   no event subscription at all.

`POST /api/v1/runs` is rewritten to call ruvector's accept/decision endpoint instead of
publishing a synthetic approval. orchestration-engine's `src/ruvector/execution-listener.ts`
and `src/ruvector/startup.ts` listener deployment are retired.

### Decision 6 — One canonical `plan_approved` envelope, owned by `agentics-contracts`

Schema `events/v1/plan-approved.schema.json`, based on the existing `PlanApprovedEvent`
(`agentics-orchestration-engine/src/ruvector/types.ts:104-116`) and extended with the
identity fields the execution-engine needs:

```jsonc
{
  "type": "plan_approved",
  "execution_id": "...",   // minted by ruvector — ADR-004
  "plan_id": "...",
  "simulation_id": "...",
  "intent_id": "...",      // deployment-intent correlation
  "execution_profile": { },
  "approver": { "id": "...", "type": "user|system|policy" },
  "timestamp": "...",
  "correlation_id": "..."
}
```

Consumers validate against this schema before dispatch and reject non-conforming events
loudly. The ad-hoc shapes at `agentics-orchestration-engine/src/server.ts:737-743` and the
bare-`ExecutionIntent` assumption at
`agentics-execution-engine/src/execution_listener.ts:50` are both retired.

### Decision 7 — `RuvectorClient.subscribe()` must actually deliver

`agentics-execution-engine/src/ruvector_client.ts:39` must register the handler and drive it.
We adopt **authenticated long-poll**, matching the pattern already working in
`agentics-orchestration-engine/src/ruvector/client.ts:412-435` (`GET /events/decisions` with
`after` cursor and `types` filter). This requires no inbound ingress on the execution-engine
and no new ruvector callback-registration API.

## Consequences

### Positive

- The chain becomes real end to end; a green run means work actually happened.
- Exactly one publisher and one subscriber per event removes the duplicate-dispatch race in which both engines could act on the same approval.
- Fail-closed configuration surfaces missing wiring at deploy time instead of hiding it behind mocks.
- One schema in `agentics-contracts` collapses three divergent payload shapes.
- The phantom `agentics-simulation-engine` is removed from the type system, so the compiler enforces the correct target.

### Negative

- **Currently-green pipelines will go red.** This is intended: they were green because nothing ran. Expect Layer-3 core dashboards to lose their synthetic feed from `server.ts:730` and show a gap until the runner genuinely executes.
- Real LLM clients and real integration adapters introduce cost, latency and rate limits where mocks were free and instant. Runner p99 will rise substantially.
- Fail-closed startup means any environment missing `ANTHROPIC_API_KEY`, vault configuration, or core URLs stops booting. Every deployment environment must be audited before rollout.
- Retiring orchestration-engine's listener deployment (`README.md:93`) is an infrastructure change, not just a code change.
- Long-polling adds sustained request volume to ruvector-service.

### Risks

- Removing the mock core registry may reveal that Layer-3 cores were never exercised at this volume. *Mitigation:* stage Phase 4 behind a single non-production environment first.
- Retargeting the planner literal is a breaking contract change for any stored plans carrying `engine: 'agentics-simulation-engine'`. *Mitigation:* the validator accepts the old literal with a deprecation warning for one release (Step 2 below), then rejects it.
- Long-poll cursor loss could duplicate or drop events. *Mitigation:* dispatch must be idempotent on `execution_id`.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Create `agentics-simulation-engine` to match the planner | Resurrects the component ADR-005 demoted. `agentics-simulation-runner` already exists and is deployed. |
| Let orchestration-engine own `plan_approved` | It is the current publisher; publisher and subscriber cannot coincide. Its charter is synchronous core delegation, not graph dispatch. |
| Let both engines subscribe, arbitrating by lease | Distributed lock across two repos to solve a problem better solved by deleting one subscriber. |
| Keep mock defaults behind an `ENABLE_MOCKS` flag | Flag-off-in-prod is exactly today's failure mode: the flag was never checked. Fail-closed is unambiguous. |
| Repair `subscribe()` with a callback-URL webhook | Requires inbound ingress plus a new ruvector registration API. Long-poll reuses a proven in-repo pattern. |
| Leave fanout, only fix `layersExecuted` | The duration and completion timestamps are equally fabricated. The whole block must be evidence-driven. |

## Implementation Plan

Executed in five phases. Each phase is independently deployable; **Phase 1 is a prerequisite
for all others.**

### Phase 1 — Contracts (agentics-contracts)

1. Add `events/v1/plan-approved.schema.json` per Decision 6.
2. Add `runner/v1/plan-submission.schema.json` for `{ execution_id, parent_span_id, plan }`.
3. Publish both to the schema registry and bump the contract package version.

### Phase 2 — Planner retarget (agentics-simulation-planner)

4. Change the literal type to `'agentics-simulation-runner'` in `src/types/simulation-plan.ts:266`, `src/types/simulation-scope.ts:120`, and `src/contracts/types.ts:13`.
5. Update the default parameter at `src/core/simulation-plan-builder.ts:225` and the advertised service name at `src/server.ts:168`.
6. In `src/contracts/validator.ts:268`, accept both literals for one release, logging a deprecation warning on the old one; then narrow to the new literal only.
7. Correct `README.md:37`, `:147`, `:374`.

### Phase 3 — Runner execution (agentics-simulation-runner)

8. Add `POST /v1/runner/plans` in `src/server.ts` (route table at `:784-794`), validating against `runner/v1/plan-submission.schema.json`.
9. Replace the empty `try` at `src/server.ts:707-714` with a real pipeline: `AgentResolver.resolveAgentInstances()` → `ConnectionEstablisher` → `gateway.submitPlanToEngine`, awaiting the result and setting `status` from it.
10. Build `FanoutContext` (`src/server.ts:722-733`) from the pipeline result. Delete the literal at `:730`; take `completedAt`/`durationMs` from observed completion, not from `Date.now()` adjacent to `startedAt`.
11. Guard `fireFanout` (`:734`) so it is unreachable unless a plan actually executed; the deprecated flat `/v1/runner` path must not fan out.
12. Delete `DefaultLLMClientFactory` (`src/orchestration/agent-resolver.ts:172-178`) and `MockLLMClient` (`:125-167`). Change the default at `:195` to the real factory from `src/surfaces/llm-client-factory.ts`; throw at construction if provider credentials are absent.
13. Delete `MockSecureVault` (`src/orchestration/connection-establisher.ts:134-175`) and `MockIntegrationAdapter` (`:180-`). Change the defaults at `:311-312` to real implementations; throw if vault configuration is absent. Remove the hardcoded credentials at `:141` and `:145`, and the permissive fallbacks at `:152-156` and `:163-164`. Retain `createMockSecureVault` (`:578`) as a test-only export.

### Phase 4 — Execution-engine trigger ownership (agentics-execution-engine)

14. Rewrite `RuvectorClient.subscribe()` (`src/ruvector_client.ts:39-52`) to store handlers in a `Map<string, handler[]>` and start a long-poll loop against `GET /events/decisions` with `after` cursor and `types` filter, mirroring `agentics-orchestration-engine/src/ruvector/client.ts:412-435`. Add `stop()` to cancel the loop.
15. In `src/execution_listener.ts:47-52`, validate the payload against `events/v1/plan-approved.schema.json` instead of casting to `ExecutionIntent`; key on `execution_id` and map `intent_id` from the canonical envelope.
16. Make `dispatchExecution` idempotent on `execution_id` to tolerate long-poll redelivery.
17. Review the `execution_started` subscription at `src/execution_listener.ts:31-36` — the service publishes that event at `:56`, so it currently subscribes to its own output. Remove the subscription.

### Phase 5 — Orchestration-engine de-scoping (agentics-orchestration-engine)

18. Replace `createMockCoreClientRegistry()` at `src/server.ts:610` with a real registry built from `SECURITY_CORE_URL` / `DATA_CORE_URL` / `GOVERNANCE_CORE_URL` / `AUTOMATION_CORE_URL`; fail closed at startup if unset.
19. Apply the same change to the `??` default at `src/ruvector/execution-listener.ts:143`.
20. Rewrite `handleCreateRun` (`src/server.ts:708-771`) to POST the intent to ruvector's accept/decision endpoint. Delete the self-minted `runId` (`:727`) and the synthetic `plan_approved` publish (`:737-753`); use the ruvector-minted `execution_id`.
21. Delete the `plan_approved` filter at `src/ruvector/client.ts:420-421` and retire `src/ruvector/execution-listener.ts` and the listener startup at `src/ruvector/startup.ts`.
22. Remove the listener service from deployment config and correct `README.md:35`, `:53`, `:64`, `:93`.

### Phase 6 — CLI cleanup (agentics-cli)

23. Delete the `'agentics-simulation-engine'` endpoint entry at `src/config/endpoints.ts:133`.
24. In `src/commands/simulate.ts`, remove the `useSimulationEngine` branch (`:451`, `:455`, `:460-470`) and route all input to the runner. Natural-language input goes to the planner first, then the resulting `SimulationPlan` to `POST /v1/runner/plans`.
25. Remove `'agentics-simulation-engine'` from `src/deps/platform-repo-resolver.ts` and `src/pipeline/phase4/phases/platform-catalog.ts:95` (which also carries the typo `agentics-simulator-runner`).

## Verification

A fix is proven only when **all** of the following hold.

1. **No phantom repo.** `grep -rn "agentics-simulation-engine" --exclude-dir=node_modules /workspace/agentics-dev` returns zero hits outside historical ADRs.
2. **No mock default in a server path.** A CI check (per ADR-010) fails the build on any `?? new Mock*` or `= createMock*Registry()` in a file reachable from a server entrypoint. Specifically asserts `agentics-orchestration-engine/src/server.ts` no longer imports from `integration/cores/mock-cores.js`.
3. **No fabricated telemetry.** A CI check fails on any array literal assigned to `layersExecuted`. A unit test asserts that a `FanoutContext` built from a no-op path is never emitted.
4. **Runner genuinely executes.** Integration test: POST a SimulationPlan with two agents and one HTTP integration to `/v1/runner/plans` against a stub LLM server and a stub integration endpoint. Assert both stubs received requests, `layersExecuted` matches the observed stage list, and `durationMs` exceeds the stub's injected 200 ms delay. The current code returns `durationMs` near 0 and would fail this test.
5. **Credentials fail closed.** Start the runner with no vault configuration; assert startup fails. Assert `resolveCredential('nonexistent')` throws `CREDENTIAL_NOT_FOUND` rather than returning `mock-resolved-nonexistent`.
6. **Subscription delivers.** Unit test: call `RuvectorClient.subscribe('plan_approved', handler)` against a fake ruvector returning one event; assert `handler` is invoked within one poll interval. The current implementation never invokes it, so this test fails today.
7. **Single subscriber.** `grep -rn "plan_approved" --exclude-dir=node_modules` shows subscription only in `agentics-execution-engine`, and publication only from ruvector-service. No hit in `agentics-orchestration-engine/src/`.
8. **Envelope conformance.** Contract test: the canonical `plan_approved` fixture validates against `events/v1/plan-approved.schema.json` and is accepted by the execution-engine listener; each of the three legacy shapes is rejected with an explicit error.
9. **End-to-end span continuity.** One `agentics simulate` invocation produces a single ruvector-minted `execution_id` whose span tree contains planner, runner, deployment-intent, execution-engine, and at least one real Layer-3 core span — satisfying ADR-009. Today this tree terminates at the runner.

## Compliance

- **ADR-003** (CLI enforcement gate) — the CLI remains the gate; Phase 6 does not bypass `enforceExecutionIntent()`.
- **ADR-004** (execution ID minting authority) — Decision 5 and Step 20 remove orchestration-engine's self-minted `runId`, restoring ruvector as sole authority.
- **ADR-005** (simulation engine demotion) — Decision 1 completes the demotion by removing the last references to the demoted component.
- **ADR-006** (core-to-repository assignment) — Phase 5 restores real core clients so the assignment map is actually exercised.
- **ADR-008** (execution graph hierarchy validation) — Decision 5 gives the execution-engine sole ownership of graph production.
- **ADR-009** (mandatory span tracing) — Decision 3 makes emitted spans correspond to real work; Verification 9 asserts an unbroken tree.
- **ADR-010** (CI static enforcement hooks) — Verification 2 and 3 are implemented as static hooks.
