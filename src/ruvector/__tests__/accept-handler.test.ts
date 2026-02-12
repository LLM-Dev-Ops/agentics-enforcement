import { describe, it, expect, beforeEach } from 'vitest';
import { AcceptHandler } from '../accept-handler.js';
import { ExecutionAcceptanceService } from '../../execution/execution-acceptance-service.js';
import { InMemoryExecutionRepository } from '../../execution/execution-repository.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import { EnforcementGate } from '../../enforcement-gate/enforcement-gate.js';
import { createEnforcementService } from '../../index.js';

function validIntentBody(overrides: Record<string, unknown> = {}) {
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

describe('AcceptHandler', () => {
  let handler: AcceptHandler;
  let repo: InMemoryExecutionRepository;
  let eventBus: EventBus;

  beforeEach(() => {
    repo = new InMemoryExecutionRepository();
    eventBus = new EventBus();
    const enforcement = createEnforcementService({ eventBus });
    const gate = new EnforcementGate(enforcement);
    const service = new ExecutionAcceptanceService(repo, eventBus);
    handler = new AcceptHandler(service, gate);
  });

  describe('valid enterprise intent (allowed)', () => {
    it('returns 201 with AcceptanceResponse', () => {
      const res = handler.handle({ body: validIntentBody() });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accepted', true);
      expect(res.body).toHaveProperty('execution_id');
      expect(res.body).toHaveProperty('root_span_id');
    });

    it('execution_id has exec- prefix', () => {
      const res = handler.handle({ body: validIntentBody() });
      expect((res.body as any).execution_id).toMatch(/^exec-/);
    });

    it('root_span_id has span- prefix', () => {
      const res = handler.handle({ body: validIntentBody() });
      expect((res.body as any).root_span_id).toMatch(/^span-/);
    });

    it('registers execution in repository', () => {
      const res = handler.handle({ body: validIntentBody() });
      const execId = (res.body as any).execution_id;
      expect(repo.findById(execId)).not.toBeNull();
    });

    it('emits ExecutionAccepted event', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('ExecutionAccepted', (e) => events.push(e));

      handler.handle({ body: validIntentBody() });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ExecutionAccepted');
    });

    it('attaches enforcement_decision to stored execution', () => {
      const res = handler.handle({ body: validIntentBody() });
      const exec = repo.findById((res.body as any).execution_id)!;
      expect(exec.enforcement_decision).not.toBeNull();
      expect(exec.enforcement_decision!.outcome).toBe('allowed');
    });
  });

  describe('enterprise intent blocked by enforcement', () => {
    it('returns 403 for non-allowlisted action', () => {
      const res = handler.handle({ body: validIntentBody({ action: 'destroy' }) });
      expect(res.status).toBe(403);
      expect((res.body as any).accepted).toBe(false);
    });

    it('includes enforcement_decision in 403 response', () => {
      const res = handler.handle({ body: validIntentBody({ action: 'destroy' }) });
      expect((res.body as any).enforcement_decision).toBeDefined();
      expect((res.body as any).enforcement_decision.outcome).toBe('blocked');
    });

    it('includes reason in 403 response', () => {
      const res = handler.handle({ body: validIntentBody({ action: 'destroy' }) });
      expect((res.body as any).reason).toBeTruthy();
    });

    it('does NOT register execution when blocked', () => {
      handler.handle({ body: validIntentBody({ action: 'destroy' }) });
      expect(repo.size()).toBe(0);
    });
  });

  describe('meta-simulation intent', () => {
    it('returns 201 even with non-allowlisted action', () => {
      const res = handler.handle({ body: validIntentBody({ is_meta_simulation: true, action: 'destroy' }) });
      expect(res.status).toBe(201);
      expect((res.body as any).accepted).toBe(true);
    });

    it('attaches enforcement_decision with rule_evaluation=null', () => {
      const res = handler.handle({ body: validIntentBody({ is_meta_simulation: true, action: 'destroy' }) });
      const exec = repo.findById((res.body as any).execution_id)!;
      expect(exec.enforcement_decision).not.toBeNull();
      expect(exec.enforcement_decision!.rule_evaluation).toBeNull();
      expect(exec.enforcement_decision!.outcome).toBe('allowed');
    });
  });

  describe('invalid intent (parse failure)', () => {
    it('returns 400 for missing required fields', () => {
      const res = handler.handle({ body: {} });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('accepted', false);
    });

    it('returns 400 for null body', () => {
      const res = handler.handle({ body: null });
      expect(res.status).toBe(400);
    });

    it('returns 400 for wrong types', () => {
      const res = handler.handle({
        body: { id: 123, caller: true, action: null, target: [], parameters: 'bad', metadata: 'bad', is_meta_simulation: 'nope' },
      });
      expect(res.status).toBe(400);
    });

    it('includes reason in rejection body', () => {
      const res = handler.handle({ body: {} });
      expect((res.body as any).reason).toBeTruthy();
    });

    it('emits ExecutionRejected event on parse failure', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('ExecutionRejected', (e) => events.push(e));

      handler.handle({ body: {} });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ExecutionRejected');
    });

    it('does NOT register execution for invalid intent', () => {
      handler.handle({ body: {} });
      expect(repo.size()).toBe(0);
    });
  });

  describe('partial intent with id present', () => {
    it('includes intent id in rejection', () => {
      const res = handler.handle({ body: { id: 'my-intent' } });
      expect(res.status).toBe(400);
      expect((res.body as any).intent_id).toBe('my-intent');
    });
  });
});
