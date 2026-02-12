/**
 * SpanFactory — Creates spans with correct defaults and type-specific validation.
 * DDD-005: Domain Service
 *
 * One method per span type. Each method:
 *   1. Assembles type-specific attributes.
 *   2. Creates a Span via createSpan().
 *   3. Emits SpanCreated domain event (if eventBus provided).
 */
import type { Span } from './span.js';
import { createSpan } from './span.js';
import type {
  ExecutionRootAttributes,
  ContractValidationAttributes,
  CoreAttributes,
  RepoAttributes,
  AgentAttributes,
} from './span-attributes.js';
import type { EventBus } from '../domain/events/event-bus.js';
import { createSpanCreatedEvent } from './observability-events.js';

export class SpanFactory {
  constructor(private readonly eventBus?: EventBus) {}

  createRootSpan(
    execution_id: string,
    caller: string,
    intent_id: string,
  ): Span {
    const attributes: ExecutionRootAttributes = {
      execution_id,
      caller,
      intent_id,
    };
    const span = createSpan({
      parent_span_id: null,
      execution_id,
      type: 'execution_root',
      attributes,
    });
    this.emitCreated(span);
    return span;
  }

  createContractValidationSpan(
    execution_id: string,
    parent_span_id: string,
    intent_id: string,
    schema_version: string,
    result: 'pass' | 'fail' | 'policy_denied',
  ): Span {
    const attributes: ContractValidationAttributes = {
      intent_id,
      schema_version,
      result,
    };
    const span = createSpan({
      parent_span_id,
      execution_id,
      type: 'contract_validation',
      attributes,
    });
    this.emitCreated(span);
    return span;
  }

  createCoreSpan(
    execution_id: string,
    parent_span_id: string,
    core_name: string,
    delegated_repos: readonly string[],
  ): Span {
    const attributes: CoreAttributes = {
      core_name,
      execution_id,
      delegated_repos,
    };
    const span = createSpan({
      parent_span_id,
      execution_id,
      type: 'core',
      attributes,
    });
    this.emitCreated(span);
    return span;
  }

  createRepoSpan(
    execution_id: string,
    parent_span_id: string,
    repo_name: string,
  ): Span {
    const attributes: RepoAttributes = {
      repo_name,
      core_parent: parent_span_id,
      execution_id,
    };
    const span = createSpan({
      parent_span_id,
      execution_id,
      type: 'repo',
      attributes,
    });
    this.emitCreated(span);
    return span;
  }

  createAgentSpan(
    execution_id: string,
    parent_span_id: string,
    agent_id: string,
  ): Span {
    const attributes: AgentAttributes = {
      agent_id,
      repo_parent: parent_span_id,
      execution_id,
    };
    const span = createSpan({
      parent_span_id,
      execution_id,
      type: 'agent',
      attributes,
    });
    this.emitCreated(span);
    return span;
  }

  private emitCreated(span: Span): void {
    if (this.eventBus) {
      this.eventBus.emit(createSpanCreatedEvent(
        span.span_id,
        span.execution_id,
        span.type,
        span.parent_span_id,
      ));
    }
  }
}
