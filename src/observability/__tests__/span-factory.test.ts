import { describe, it, expect, beforeEach } from 'vitest';
import { SpanFactory } from '../span-factory.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import type { ExecutionRootAttributes, ContractValidationAttributes, CoreAttributes, RepoAttributes, AgentAttributes } from '../span-attributes.js';

describe('SpanFactory', () => {
  let factory: SpanFactory;

  beforeEach(() => {
    factory = new SpanFactory();
  });

  describe('createRootSpan', () => {
    it('creates a span with type execution_root', () => {
      const span = factory.createRootSpan('exec-1', 'cli-user', 'intent-1');
      expect(span.type).toBe('execution_root');
    });

    it('has null parent_span_id', () => {
      const span = factory.createRootSpan('exec-1', 'cli-user', 'intent-1');
      expect(span.parent_span_id).toBeNull();
    });

    it('sets correct ExecutionRootAttributes', () => {
      const span = factory.createRootSpan('exec-1', 'cli-user', 'intent-1');
      const attrs = span.attributes as ExecutionRootAttributes;
      expect(attrs.execution_id).toBe('exec-1');
      expect(attrs.caller).toBe('cli-user');
      expect(attrs.intent_id).toBe('intent-1');
    });

    it('is in open status', () => {
      const span = factory.createRootSpan('exec-1', 'cli-user', 'intent-1');
      expect(span.status).toBe('open');
    });
  });

  describe('createContractValidationSpan', () => {
    it('creates a span with type contract_validation', () => {
      const span = factory.createContractValidationSpan('exec-1', 'span-root', 'intent-1', '0.1.0', 'pass');
      expect(span.type).toBe('contract_validation');
    });

    it('sets parent_span_id', () => {
      const span = factory.createContractValidationSpan('exec-1', 'span-root', 'intent-1', '0.1.0', 'fail');
      expect(span.parent_span_id).toBe('span-root');
    });

    it('sets correct ContractValidationAttributes', () => {
      const span = factory.createContractValidationSpan('exec-1', 'span-root', 'intent-1', '0.1.0', 'policy_denied');
      const attrs = span.attributes as ContractValidationAttributes;
      expect(attrs.intent_id).toBe('intent-1');
      expect(attrs.schema_version).toBe('0.1.0');
      expect(attrs.result).toBe('policy_denied');
    });
  });

  describe('createCoreSpan', () => {
    it('creates a span with type core', () => {
      const span = factory.createCoreSpan('exec-1', 'span-root', 'security-core', ['repo-a', 'repo-b']);
      expect(span.type).toBe('core');
    });

    it('sets correct CoreAttributes including delegated_repos', () => {
      const span = factory.createCoreSpan('exec-1', 'span-root', 'security-core', ['repo-a']);
      const attrs = span.attributes as CoreAttributes;
      expect(attrs.core_name).toBe('security-core');
      expect(attrs.execution_id).toBe('exec-1');
      expect(attrs.delegated_repos).toEqual(['repo-a']);
    });
  });

  describe('createRepoSpan', () => {
    it('creates a span with type repo', () => {
      const span = factory.createRepoSpan('exec-1', 'span-core', 'foundational-repo');
      expect(span.type).toBe('repo');
    });

    it('sets core_parent in attributes from parent_span_id', () => {
      const span = factory.createRepoSpan('exec-1', 'span-core', 'foundational-repo');
      const attrs = span.attributes as RepoAttributes;
      expect(attrs.repo_name).toBe('foundational-repo');
      expect(attrs.core_parent).toBe('span-core');
      expect(attrs.execution_id).toBe('exec-1');
    });
  });

  describe('createAgentSpan', () => {
    it('creates a span with type agent', () => {
      const span = factory.createAgentSpan('exec-1', 'span-repo', 'agent-42');
      expect(span.type).toBe('agent');
    });

    it('sets repo_parent in attributes from parent_span_id', () => {
      const span = factory.createAgentSpan('exec-1', 'span-repo', 'agent-42');
      const attrs = span.attributes as AgentAttributes;
      expect(attrs.agent_id).toBe('agent-42');
      expect(attrs.repo_parent).toBe('span-repo');
      expect(attrs.execution_id).toBe('exec-1');
    });
  });

  describe('event emission', () => {
    it('emits SpanCreated when EventBus is provided', () => {
      const eventBus = new EventBus();
      const events: DomainEvent[] = [];
      eventBus.subscribe('SpanCreated', (e) => events.push(e));

      const factoryWithBus = new SpanFactory(eventBus);
      const span = factoryWithBus.createRootSpan('exec-1', 'cli', 'i-1');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('SpanCreated');
      expect(events[0].payload.span_id).toBe(span.span_id);
      expect(events[0].payload.execution_id).toBe('exec-1');
      expect(events[0].payload.span_type).toBe('execution_root');
      expect(events[0].payload.parent_span_id).toBeNull();
    });

    it('emits SpanCreated for child spans with parent_span_id', () => {
      const eventBus = new EventBus();
      const events: DomainEvent[] = [];
      eventBus.subscribe('SpanCreated', (e) => events.push(e));

      const factoryWithBus = new SpanFactory(eventBus);
      factoryWithBus.createCoreSpan('exec-1', 'span-root', 'my-core', []);

      expect(events).toHaveLength(1);
      expect(events[0].payload.parent_span_id).toBe('span-root');
    });

    it('does not throw when no EventBus is provided', () => {
      const noEventFactory = new SpanFactory();
      expect(() => noEventFactory.createRootSpan('exec-1', 'cli', 'i-1')).not.toThrow();
    });
  });
});
