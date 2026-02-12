import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionAcceptanceService } from '../execution-acceptance-service.js';
import { InMemoryExecutionRepository } from '../execution-repository.js';
import { transitionExecution } from '../execution.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import { AcceptHandler } from '../../ruvector/accept-handler.js';
import { EnforcementGate } from '../../enforcement-gate/enforcement-gate.js';
import { createEnforcementService } from '../../index.js';
import type { ExecutionIntent } from '../../contracts/index.js';

function makeIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
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

describe('Execution domain integration', () => {
  let repo: InMemoryExecutionRepository;
  let eventBus: EventBus;
  let service: ExecutionAcceptanceService;
  let handler: AcceptHandler;
  let allEvents: DomainEvent[];

  beforeEach(() => {
    repo = new InMemoryExecutionRepository();
    eventBus = new EventBus();
    const enforcement = createEnforcementService({ eventBus });
    const gate = new EnforcementGate(enforcement);
    service = new ExecutionAcceptanceService(repo, eventBus);
    handler = new AcceptHandler(service, gate);
    allEvents = [];
    eventBus.subscribe('ExecutionAccepted', (e) => allEvents.push(e));
    eventBus.subscribe('ExecutionRejected', (e) => allEvents.push(e));
  });

  it('full accept flow: handler → gate → service → repository → events', () => {
    const res = handler.handle({ body: makeIntent() });

    // Handler returns 201
    expect(res.status).toBe(201);
    const body = res.body as any;
    expect(body.accepted).toBe(true);

    // Repository has the execution
    const exec = repo.findById(body.execution_id);
    expect(exec).not.toBeNull();
    expect(exec!.status).toBe('accepted');
    expect(exec!.intent.id).toBe('intent-1');
    expect(exec!.root_span.execution_id).toBe(body.execution_id);

    // Enforcement decision attached
    expect(exec!.enforcement_decision).not.toBeNull();
    expect(exec!.enforcement_decision!.outcome).toBe('allowed');

    // Event was emitted
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].type).toBe('ExecutionAccepted');
  });

  it('full reject flow: handler → service → events (no repository entry)', () => {
    const res = handler.handle({ body: { id: 'bad-intent' } });

    // Handler returns 400
    expect(res.status).toBe(400);
    expect((res.body as any).accepted).toBe(false);

    // Repository is empty
    expect(repo.size()).toBe(0);

    // Rejection event was emitted
    expect(allEvents).toHaveLength(1);
    expect(allEvents[0].type).toBe('ExecutionRejected');
  });

  it('enforcement block: handler → gate blocks → 403 (no repository entry)', () => {
    const res = handler.handle({ body: makeIntent({ action: 'destroy' }) });
    expect(res.status).toBe(403);
    expect(repo.size()).toBe(0);
  });

  it('accepted execution transitions through full lifecycle', () => {
    const res = handler.handle({ body: makeIntent() });
    const exec = repo.findById((res.body as any).execution_id)!;

    expect(exec.status).toBe('accepted');
    transitionExecution(exec, 'validating');
    expect(exec.status).toBe('validating');
    transitionExecution(exec, 'dispatching');
    expect(exec.status).toBe('dispatching');
    transitionExecution(exec, 'completed');
    expect(exec.status).toBe('completed');
  });

  it('accepted execution can transition to failed', () => {
    const res = handler.handle({ body: makeIntent() });
    const exec = repo.findById((res.body as any).execution_id)!;

    transitionExecution(exec, 'failed');
    expect(exec.status).toBe('failed');
  });

  it('accepted execution can transition to rejected', () => {
    const res = handler.handle({ body: makeIntent() });
    const exec = repo.findById((res.body as any).execution_id)!;

    transitionExecution(exec, 'rejected');
    expect(exec.status).toBe('rejected');
  });

  it('multiple accepts produce distinct execution_ids', () => {
    const r1 = handler.handle({ body: makeIntent({ id: 'i-1' }) });
    const r2 = handler.handle({ body: makeIntent({ id: 'i-2' }) });
    const r3 = handler.handle({ body: makeIntent({ id: 'i-3' }) });

    const ids = [r1, r2, r3].map((r) => (r.body as any).execution_id);
    expect(new Set(ids).size).toBe(3);
    expect(repo.findActive()).toHaveLength(3);
  });

  it('findActive() excludes terminal states', () => {
    handler.handle({ body: makeIntent({ id: 'i-1' }) });
    handler.handle({ body: makeIntent({ id: 'i-2' }) });
    handler.handle({ body: makeIntent({ id: 'i-3' }) });

    const [e1, e2, e3] = repo.findActive();
    transitionExecution(e1, 'failed');
    transitionExecution(e2, 'validating');
    transitionExecution(e2, 'dispatching');
    transitionExecution(e2, 'completed');

    // Only e3 remains active (still in 'accepted')
    expect(repo.findActive()).toHaveLength(1);
    expect(repo.findActive()[0].execution_id.value).toBe(e3.execution_id.value);
  });

  it('root span is atomically linked to execution', () => {
    const res = handler.handle({ body: makeIntent() });
    const exec = repo.findById((res.body as any).execution_id)!;

    expect(exec.root_span.type).toBe('execution_root');
    expect(exec.root_span.execution_id).toBe(exec.execution_id.value);
    expect(exec.root_span.intent_id).toBe('intent-1');
    expect(exec.root_span.caller).toBe('cli-user');
    expect(exec.root_span.span_id).toBe((res.body as any).root_span_id);
  });
});
