/**
 * SpanFactory — Creates spans with correct defaults and type-specific validation.
 * DDD-005: Domain Service
 *
 * One method per span type. Each method:
 *   1. Validates parent_span_id (REQUIRED for non-root spans — throws if missing).
 *   2. Assembles type-specific attributes.
 *   3. Creates a Span via createSpan().
 *   4. Emits SpanCreated domain event (if eventBus provided).
 *
 * NO orphan spans. NO non-null assertions. Missing identifiers → throw.
 */
import type { Span } from './span.js';
import { createSpan, MissingSpanIdentifierError } from './span.js';
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
    if (!execution_id) {
      throw new MissingSpanIdentifierError('execution_id', 'execution_root');
    }
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
    this.requireParentSpanId(parent_span_id, execution_id, 'contract_validation');
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
    simulation_resolution?: string,
  ): Span {
    this.requireParentSpanId(parent_span_id, execution_id, 'core');
    const attributes: CoreAttributes = {
      core_name,
      execution_id,
      delegated_repos,
      ...(simulation_resolution ? { simulation_resolution } : {}),
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
    simulation_resolution?: string,
  ): Span {
    this.requireParentSpanId(parent_span_id, execution_id, 'repo');
    const attributes: RepoAttributes = {
      repo_name,
      core_parent: parent_span_id,
      execution_id,
      ...(simulation_resolution ? { simulation_resolution } : {}),
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
    this.requireParentSpanId(parent_span_id, execution_id, 'agent');
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

  /**
   * Require parent_span_id for non-root spans.
   * Throws immediately if missing — NO orphan spans allowed.
   */
  private requireParentSpanId(
    parent_span_id: string | undefined | null,
    execution_id: string,
    span_type: string,
  ): asserts parent_span_id is string {
    if (!parent_span_id) {
      throw new MissingSpanIdentifierError(
        `parent_span_id (required for ${span_type} span, execution_id: ${execution_id})`,
        span_type as any,
      );
    }
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
