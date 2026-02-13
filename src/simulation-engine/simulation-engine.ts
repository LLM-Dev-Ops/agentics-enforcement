/**
 * SimulationEngine — Pure delegation orchestrator.
 * ADR-005: Demoted to delegation-only. NO policy, cost, artifact, or validation logic.
 *
 * Responsibilities:
 *   1. Drive execution lifecycle (accepted → validating → dispatching → completed/failed)
 *   2. Walk the execution graph to extract core steps
 *   3. Resolve which CoreDelegate handles each step
 *   4. Delegate to the resolved Core
 *   5. Collect and aggregate CoreExecutionResults
 *
 * Contract enforcement:
 *   - Validates ExecutionGraph against contracts before processing.
 *   - Validates each CoreExecutionResult against contracts before aggregating.
 *   - Validates DispatchResult against contracts before returning.
 *   - simulation_resolution is propagated from execution context to spans and output.
 *   - NO non-null assertions. All lookups validated explicitly.
 */
import type { Execution } from '../execution/execution.js';
import { transitionExecution } from '../execution/execution.js';
import type { ExecutionGraph } from '../contracts/index.js';
import type { CoreResolver } from './core-resolver.js';
import { extractCoreSteps } from './graph-walker.js';
import { validateRepoAssignments, RepoAssignmentViolationError } from './repo-guard.js';
import { validateGraphHierarchy, GraphHierarchyViolationError } from './graph-hierarchy-validator.js';
import { createDispatchResult, type DispatchResult } from './dispatch-result.js';
import { SpanFactory } from '../observability/span-factory.js';
import { closeSpan } from '../observability/span.js';
import type { EventBus } from '../domain/events/event-bus.js';
import { SchemaRegistry, ContractValidationError } from '../services/schema-registry.js';
import {
  createDispatchStartedEvent,
  createCoreDelegationStartedEvent,
  createCoreDelegationCompletedEvent,
  createDispatchCompletedEvent,
  createDispatchFailedEvent,
} from './simulation-engine-events.js';

export { RepoAssignmentViolationError } from './repo-guard.js';
export { GraphHierarchyViolationError } from './graph-hierarchy-validator.js';

export class UnresolvedCoreError extends Error {
  override readonly name = 'UnresolvedCoreError';
  constructor(public readonly coreName: string) {
    super(`No delegate registered for core: ${coreName}`);
  }
}

export class SimulationEngine {
  private readonly schemaRegistry: SchemaRegistry;

  constructor(
    private readonly resolver: CoreResolver,
    private readonly spanFactory: SpanFactory,
    private readonly eventBus?: EventBus,
  ) {
    this.schemaRegistry = new SchemaRegistry();
  }

  dispatch(execution: Execution, graph: ExecutionGraph): DispatchResult {
    // Runtime validation: validate graph against contracts before processing
    this.schemaRegistry.validateOrThrow(
      'ExecutionGraph',
      graph,
      execution.execution_id.value,
    );

    // 1. Transition: accepted → validating
    transitionExecution(execution, 'validating');

    // 2. Extract core steps from graph in topological order
    const steps = extractCoreSteps(graph);

    // 2a. Validate graph hierarchy (execution_root → core → repo → agent)
    const hierarchyResult = validateGraphHierarchy(graph);
    if (!hierarchyResult.valid) {
      transitionExecution(execution, 'failed');
      this.emit(createDispatchFailedEvent(
        execution.execution_id.value,
        `Graph hierarchy violations: ${hierarchyResult.violations.map((v) => v.message).join('; ')}`,
      ));
      throw new GraphHierarchyViolationError(hierarchyResult.violations);
    }

    // 2b. Validate repo assignments against immutable core-to-repo map
    const repoViolations = validateRepoAssignments(steps);
    if (repoViolations.length > 0) {
      transitionExecution(execution, 'failed');
      this.emit(createDispatchFailedEvent(
        execution.execution_id.value,
        `Repo assignment violations: ${repoViolations.map((v) => v.message).join('; ')}`,
      ));
      throw new RepoAssignmentViolationError(repoViolations);
    }

    // 3. Transition: validating → dispatching
    transitionExecution(execution, 'dispatching');
    this.emit(createDispatchStartedEvent(execution.execution_id.value, steps.length));

    // 4. Delegate to each core in order
    for (const step of steps) {
      const delegate = this.resolver.resolve(step.coreName);
      if (!delegate) {
        // Fail-closed: unknown core → fail immediately
        transitionExecution(execution, 'failed');
        this.emit(createDispatchFailedEvent(
          execution.execution_id.value,
          `No delegate for core: ${step.coreName}`,
        ));
        throw new UnresolvedCoreError(step.coreName);
      }

      // Create core span — attach to root span, propagate simulation_resolution
      const repoNames = step.childNodes
        .filter((n) => n.type === 'repo')
        .map((n) => n.name);
      const span = this.spanFactory.createCoreSpan(
        execution.execution_id.value,
        execution.root_span.span_id,
        step.coreName,
        repoNames,
        execution.simulation_resolution,
      );

      this.emit(createCoreDelegationStartedEvent(execution.execution_id.value, step.coreName));

      // Delegate
      const result = delegate.execute(
        step.coreName,
        execution.execution_id.value,
        [...step.childNodes],
      );

      // Runtime validation: validate CoreExecutionResult against contracts
      this.schemaRegistry.validateOrThrow(
        'CoreExecutionResult',
        result,
        execution.execution_id.value,
      );

      // Close span based on result status
      closeSpan(span, result.status === 'success');
      execution.results.push(result);
      this.emit(createCoreDelegationCompletedEvent(
        execution.execution_id.value,
        step.coreName,
        result.status,
      ));

      // Fail-fast on core failure
      if (result.status === 'failure') {
        transitionExecution(execution, 'failed');
        this.emit(createDispatchFailedEvent(
          execution.execution_id.value,
          `Core ${step.coreName} failed`,
        ));
        return createDispatchResult(
          execution.execution_id.value,
          [...execution.results],
          execution.simulation_resolution,
        );
      }
    }

    // 5. All cores succeeded — transition to completed
    transitionExecution(execution, 'completed');
    const dispatchResult = createDispatchResult(
      execution.execution_id.value,
      [...execution.results],
      execution.simulation_resolution,
    );
    this.emit(createDispatchCompletedEvent(
      execution.execution_id.value,
      dispatchResult.outcome,
      dispatchResult.results.length,
    ));

    return dispatchResult;
  }

  private emit(event: import('../domain/events/event-bus.js').DomainEvent): void {
    if (this.eventBus) {
      this.eventBus.emit(event);
    }
  }
}
