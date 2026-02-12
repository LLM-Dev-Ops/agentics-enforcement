import { describe, it, expect, beforeEach } from 'vitest';
import { EnforcementGate } from '../enforcement-gate.js';
import { createEnforcementService } from '../../index.js';
import { AcceptHandler } from '../../ruvector/accept-handler.js';
import { ExecutionAcceptanceService } from '../../execution/execution-acceptance-service.js';
import { InMemoryExecutionRepository } from '../../execution/execution-repository.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import type { ExecutionIntent } from '../../contracts/index.js';

function validBody(overrides: Partial<ExecutionIntent> = {}) {
  return {
    id: 'intent-1',
    caller: 'cli-user',
    action: 'simulate',
    target: 'security-core',
    parameters: {},
    metadata: {},
    is_meta_simulation: false,
    ...overrides,
  };
}

describe('EnforcementGate integration (ADR-003)', () => {
  let handler: AcceptHandler;
  let repo: InMemoryExecutionRepository;
  let eventBus: EventBus;
  let allEvents: DomainEvent[];

  beforeEach(() => {
    eventBus = new EventBus();
    const enforcement = createEnforcementService({ eventBus });
    const gate = new EnforcementGate(enforcement);
    repo = new InMemoryExecutionRepository();
    const acceptanceService = new ExecutionAcceptanceService(repo, eventBus);
    handler = new AcceptHandler(acceptanceService, gate);
    allEvents = [];
    eventBus.subscribe('ExecutionAccepted', (e) => allEvents.push(e));
    eventBus.subscribe('ExecutionRejected', (e) => allEvents.push(e));
    eventBus.subscribe('EnforcementDecisionMade', (e) => allEvents.push(e));
  });

  it('enterprise intent allowed: 201, execution created with enforcement_decision', () => {
    const res = handler.handle({ body: validBody() });
    expect(res.status).toBe(201);

    const body = res.body as any;
    expect(body.accepted).toBe(true);

    const exec = repo.findById(body.execution_id)!;
    expect(exec).not.toBeNull();
    expect(exec.enforcement_decision).not.toBeNull();
    expect(exec.enforcement_decision!.outcome).toBe('allowed');
    expect(exec.enforcement_decision!.rule_evaluation).not.toBeNull();
  });

  it('enterprise intent blocked by rules: 403, no execution minted', () => {
    const res = handler.handle({ body: validBody({ action: 'destroy' }) });
    expect(res.status).toBe(403);

    const body = res.body as any;
    expect(body.accepted).toBe(false);
    expect(body.enforcement_decision).toBeDefined();
    expect(body.enforcement_decision.outcome).toBe('blocked');
    expect(body.enforcement_decision.block_reason.phase).toBe('rule_evaluation');

    expect(repo.size()).toBe(0);
  });

  it('meta-simulation with non-allowlisted action: 201, decision has rule_evaluation=null', () => {
    const res = handler.handle({ body: validBody({ is_meta_simulation: true, action: 'destroy' }) });
    expect(res.status).toBe(201);

    const body = res.body as any;
    expect(body.accepted).toBe(true);

    const exec = repo.findById(body.execution_id)!;
    expect(exec.enforcement_decision).not.toBeNull();
    expect(exec.enforcement_decision!.outcome).toBe('allowed');
    expect(exec.enforcement_decision!.rule_evaluation).toBeNull();
  });

  it('meta-simulation with valid action: 201, schema passes', () => {
    const res = handler.handle({ body: validBody({ is_meta_simulation: true }) });
    expect(res.status).toBe(201);

    const exec = repo.findById((res.body as any).execution_id)!;
    expect(exec.enforcement_decision!.schema_validation.passed).toBe(true);
  });

  it('malformed body: 400 (parse failure before gate)', () => {
    const res = handler.handle({ body: {} });
    expect(res.status).toBe(400);
    expect(repo.size()).toBe(0);
  });

  it('enforcement decision persists on execution aggregate in repository', () => {
    const res = handler.handle({ body: validBody({ id: 'persist-test' }) });
    const exec = repo.findById((res.body as any).execution_id)!;

    expect(exec.enforcement_decision).not.toBeNull();
    expect(exec.enforcement_decision!.intent_id).toBe('persist-test');
    expect(exec.enforcement_decision!.schema_version).toBeTruthy();
    expect(exec.enforcement_decision!.evaluated_at).toBeTruthy();
  });

  it('multiple accepts maintain separate enforcement decisions', () => {
    const r1 = handler.handle({ body: validBody({ id: 'i-1' }) });
    const r2 = handler.handle({ body: validBody({ id: 'i-2', is_meta_simulation: true }) });

    const e1 = repo.findById((r1.body as any).execution_id)!;
    const e2 = repo.findById((r2.body as any).execution_id)!;

    // Enterprise decision has rule_evaluation
    expect(e1.enforcement_decision!.rule_evaluation).not.toBeNull();
    // Meta-sim decision does not
    expect(e2.enforcement_decision!.rule_evaluation).toBeNull();
    // Different decision IDs
    expect(e1.enforcement_decision!.decision_id).not.toBe(e2.enforcement_decision!.decision_id);
  });
});
