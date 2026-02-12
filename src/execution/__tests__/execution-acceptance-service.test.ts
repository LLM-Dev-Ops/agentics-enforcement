import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionAcceptanceService } from '../execution-acceptance-service.js';
import { InMemoryExecutionRepository } from '../execution-repository.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import type { ExecutionIntent } from '../../contracts/index.js';
import type { EnforcementDecision } from '../../domain/enforcement-decision.js';

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

describe('ExecutionAcceptanceService', () => {
  let repo: InMemoryExecutionRepository;
  let eventBus: EventBus;
  let service: ExecutionAcceptanceService;

  beforeEach(() => {
    repo = new InMemoryExecutionRepository();
    eventBus = new EventBus();
    service = new ExecutionAcceptanceService(repo, eventBus);
  });

  describe('accept()', () => {
    it('returns AcceptanceResponse with execution_id and root_span_id', () => {
      const result = service.accept(makeIntent());
      expect(result.accepted).toBe(true);
      expect(result.execution_id).toMatch(/^exec-/);
      expect(result.root_span_id).toMatch(/^span-/);
    });

    it('mints a unique execution_id each time', () => {
      const r1 = service.accept(makeIntent());
      const r2 = service.accept(makeIntent({ id: 'intent-2' }));
      expect(r1.execution_id).not.toBe(r2.execution_id);
    });

    it('registers execution in repository', () => {
      const result = service.accept(makeIntent());
      const stored = repo.findById(result.execution_id);
      expect(stored).not.toBeNull();
      expect(stored!.execution_id.value).toBe(result.execution_id);
      expect(stored!.status).toBe('accepted');
    });

    it('stores intent on the execution aggregate', () => {
      const intent = makeIntent({ id: 'intent-x', caller: 'test-caller' });
      const result = service.accept(intent);
      const stored = repo.findById(result.execution_id);
      expect(stored!.intent.id).toBe('intent-x');
      expect(stored!.caller).toBe('test-caller');
    });

    it('emits ExecutionAccepted event', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('ExecutionAccepted', (e) => events.push(e));

      const result = service.accept(makeIntent());

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ExecutionAccepted');
      expect(events[0].payload.execution_id).toBe(result.execution_id);
      expect(events[0].payload.intent_id).toBe('intent-1');
      expect(events[0].payload.root_span_id).toBe(result.root_span_id);
    });

    it('throws if intent.id is empty', () => {
      expect(() => service.accept(makeIntent({ id: '' }))).toThrow('intent.id is required');
    });

    it('throws if intent.caller is empty', () => {
      expect(() => service.accept(makeIntent({ caller: '' }))).toThrow('intent.caller is required');
    });

    it('throws if intent.action is empty', () => {
      expect(() => service.accept(makeIntent({ action: '' }))).toThrow('intent.action is required');
    });

    it('throws if intent.target is empty', () => {
      expect(() => service.accept(makeIntent({ target: '' }))).toThrow('intent.target is required');
    });
  });

  describe('accept() with enforcement decision', () => {
    const mockDecision: EnforcementDecision = {
      decision_id: 'dec-test',
      intent_id: 'intent-1',
      schema_validation: { passed: true, schema_name: 'ExecutionIntent', schema_version: '0.1.0', errors: [] },
      rule_evaluation: null,
      outcome: 'allowed',
      block_reason: null,
      span_emitted: false,
      evaluated_at: new Date().toISOString(),
      schema_version: '0.1.0',
    };

    it('passes enforcement_decision to execution aggregate', () => {
      const result = service.accept(makeIntent(), mockDecision);
      const stored = repo.findById(result.execution_id);
      expect(stored!.enforcement_decision).not.toBeNull();
      expect(stored!.enforcement_decision!.decision_id).toBe('dec-test');
    });

    it('without enforcement_decision defaults to null', () => {
      const result = service.accept(makeIntent());
      const stored = repo.findById(result.execution_id);
      expect(stored!.enforcement_decision).toBeNull();
    });
  });

  describe('reject()', () => {
    it('returns RejectionResponse with reason and intent_id', () => {
      const result = service.reject(makeIntent(), 'Policy violation');
      expect(result.accepted).toBe(false);
      expect(result.intent_id).toBe('intent-1');
      expect(result.reason).toBe('Policy violation');
    });

    it('does NOT mint an execution_id', () => {
      service.reject(makeIntent(), 'blocked');
      expect(repo.size()).toBe(0);
    });

    it('emits ExecutionRejected event', () => {
      const events: DomainEvent[] = [];
      eventBus.subscribe('ExecutionRejected', (e) => events.push(e));

      service.reject(makeIntent({ id: 'intent-rej' }), 'Not allowed');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('ExecutionRejected');
      expect(events[0].payload.intent_id).toBe('intent-rej');
      expect(events[0].payload.reason).toBe('Not allowed');
    });
  });
});
