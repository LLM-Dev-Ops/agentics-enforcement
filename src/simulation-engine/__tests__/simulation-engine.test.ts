import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine, UnresolvedCoreError, RepoAssignmentViolationError, GraphHierarchyViolationError } from '../simulation-engine.js';
import { MapCoreResolver } from '../core-resolver.js';
import { InMemoryStubDelegate } from '../core-delegate.js';
import { SpanFactory } from '../../observability/span-factory.js';
import { EventBus, type DomainEvent } from '../../domain/events/event-bus.js';
import { createExecution } from '../../execution/execution.js';
import { mintExecutionId } from '../../execution/execution-id.js';
import { createRootSpanMeta } from '../../execution/root-span-meta.js';
import type { ExecutionGraph, CoreExecutionResult, ExecutionIntent } from '../../contracts/index.js';

function makeIntent(): ExecutionIntent {
  return {
    id: 'intent-1',
    caller: 'test-cli',
    action: 'deploy',
    target: 'staging',
    parameters: {},
    metadata: {},
    is_meta_simulation: false,
  };
}

function makeExecution() {
  const id = mintExecutionId();
  const span = createRootSpanMeta(id.value, 'intent-1', 'test-cli');
  return createExecution(id, makeIntent(), span);
}

function makeSuccessResult(coreName: string, executionId: string): CoreExecutionResult {
  return {
    core_name: coreName,
    execution_id: executionId,
    status: 'success',
    evidence: { execution_id: executionId, entries: [] },
    cost_ref: null,
    outputs: {},
  };
}

function makeFailureResult(coreName: string, executionId: string): CoreExecutionResult {
  return {
    core_name: coreName,
    execution_id: executionId,
    status: 'failure',
    evidence: { execution_id: executionId, entries: [] },
    cost_ref: null,
    outputs: {},
  };
}

function makeSingleCoreGraph(): ExecutionGraph {
  return {
    nodes: [
      { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
      { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
      { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: [] },
    ],
    edges: [],
    validated: true,
  };
}

function makeTwoCoreGraph(): ExecutionGraph {
  return {
    nodes: [
      { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1', 'c2'] },
      { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: [] },
      { id: 'c2', type: 'core', name: 'Governance-Core', parent_id: 'root', children_ids: [] },
    ],
    edges: [{ from: 'c1', to: 'c2' }],
    validated: true,
  };
}

describe('SimulationEngine', () => {
  let eventBus: EventBus;
  let events: DomainEvent[];
  let spanFactory: SpanFactory;

  beforeEach(() => {
    eventBus = new EventBus();
    events = [];
    // Capture all events
    for (const type of [
      'DispatchStarted', 'CoreDelegationStarted', 'CoreDelegationCompleted',
      'DispatchCompleted', 'DispatchFailed', 'SpanCreated',
    ]) {
      eventBus.subscribe(type, (e) => events.push(e));
    }
    spanFactory = new SpanFactory(eventBus);
  });

  describe('successful dispatch', () => {
    it('transitions execution through accepted → validating → dispatching → completed', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      expect(execution.status).toBe('accepted');
      engine.dispatch(execution, makeSingleCoreGraph());
      expect(execution.status).toBe('completed');
    });

    it('returns DispatchResult with success outcome', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const result = engine.dispatch(execution, makeSingleCoreGraph());
      expect(result.outcome).toBe('success');
      expect(result.execution_id).toBe(execution.execution_id.value);
    });

    it('collects CoreExecutionResults on the execution aggregate', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      expect(execution.results).toHaveLength(1);
      expect(execution.results[0].core_name).toBe('Security-Core');
    });

    it('handles multiple cores in dependency order', () => {
      const execution = makeExecution();
      const execId = execution.execution_id.value;
      const delegateA = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execId));
      const delegateB = new InMemoryStubDelegate(makeSuccessResult('Governance-Core', execId));
      const resolver = new MapCoreResolver(new Map([
        ['Security-Core', delegateA],
        ['Governance-Core', delegateB],
      ]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const result = engine.dispatch(execution, makeTwoCoreGraph());
      expect(result.outcome).toBe('success');
      expect(result.results).toHaveLength(2);
    });
  });

  describe('fail-fast on core failure', () => {
    it('transitions to failed when a core returns failure', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeFailureResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      expect(execution.status).toBe('failed');
    });

    it('returns DispatchResult with failure outcome', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeFailureResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const result = engine.dispatch(execution, makeSingleCoreGraph());
      expect(result.outcome).toBe('failure');
    });

    it('stops after first failure — second core not executed', () => {
      const execution = makeExecution();
      const execId = execution.execution_id.value;
      let secondCoreCalled = false;
      const failDelegate = new InMemoryStubDelegate(makeFailureResult('Security-Core', execId));
      const spyDelegate = {
        execute: () => {
          secondCoreCalled = true;
          return makeSuccessResult('Governance-Core', execId);
        },
      };
      const resolver = new MapCoreResolver(new Map([
        ['Security-Core', failDelegate],
        ['Governance-Core', spyDelegate],
      ]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeTwoCoreGraph());
      expect(secondCoreCalled).toBe(false);
      expect(execution.results).toHaveLength(1);
    });
  });

  describe('unresolved core (fail-closed)', () => {
    it('throws UnresolvedCoreError when core has no delegate', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map()); // empty — no delegates
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      expect(() => engine.dispatch(execution, makeSingleCoreGraph())).toThrow(UnresolvedCoreError);
    });

    it('transitions execution to failed before throwing', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      try {
        engine.dispatch(execution, makeSingleCoreGraph());
      } catch {
        // expected
      }
      expect(execution.status).toBe('failed');
    });
  });

  describe('span emission', () => {
    it('emits SpanCreated for each core delegation', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const spanCreated = events.filter((e) => e.type === 'SpanCreated' && e.payload.span_type === 'core');
      expect(spanCreated).toHaveLength(1);
    });

    it('emits SpanCreated for failed core delegation too', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeFailureResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const spanCreated = events.filter((e) => e.type === 'SpanCreated' && e.payload.span_type === 'core');
      expect(spanCreated).toHaveLength(1);
    });
  });

  describe('domain events', () => {
    it('emits DispatchStarted with core_count', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const started = events.find((e) => e.type === 'DispatchStarted');
      expect(started).toBeTruthy();
      expect(started!.payload.core_count).toBe(1);
    });

    it('emits CoreDelegationStarted and CoreDelegationCompleted', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const delegationStarted = events.filter((e) => e.type === 'CoreDelegationStarted');
      const delegationCompleted = events.filter((e) => e.type === 'CoreDelegationCompleted');
      expect(delegationStarted).toHaveLength(1);
      expect(delegationCompleted).toHaveLength(1);
      expect(delegationStarted[0].payload.core_name).toBe('Security-Core');
    });

    it('emits DispatchCompleted on success', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const completed = events.find((e) => e.type === 'DispatchCompleted');
      expect(completed).toBeTruthy();
      expect(completed!.payload.outcome).toBe('success');
    });

    it('emits DispatchFailed on core failure', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeFailureResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      engine.dispatch(execution, makeSingleCoreGraph());
      const failed = events.find((e) => e.type === 'DispatchFailed');
      expect(failed).toBeTruthy();
    });

    it('works without an EventBus (no events emitted, no errors)', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const noEventSpanFactory = new SpanFactory(); // no eventBus
      const engine = new SimulationEngine(resolver, noEventSpanFactory); // no eventBus

      expect(() => engine.dispatch(execution, makeSingleCoreGraph())).not.toThrow();
    });
  });

  describe('empty graph', () => {
    it('completes immediately with success for graph with no core nodes', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: [] },
        ],
        edges: [],
        validated: true,
      };

      const result = engine.dispatch(execution, graph);
      expect(result.outcome).toBe('success');
      expect(result.results).toHaveLength(0);
      expect(execution.status).toBe('completed');
    });
  });

  describe('repo assignment guard', () => {
    it('rejects dispatch when repo is under wrong core', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      // CostOps is assigned to Governance-Core, not Security-Core
      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
          { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
          { id: 'r1', type: 'repo', name: 'CostOps', parent_id: 'c1', children_ids: [] },
        ],
        edges: [],
        validated: true,
      };

      expect(() => engine.dispatch(execution, graph)).toThrow(RepoAssignmentViolationError);
      expect(execution.status).toBe('failed');
    });

    it('succeeds when repos are correctly assigned', () => {
      const execution = makeExecution();
      const delegate = new InMemoryStubDelegate(makeSuccessResult('Security-Core', execution.execution_id.value));
      const resolver = new MapCoreResolver(new Map([['Security-Core', delegate]]));
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
          { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
          { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: [] },
        ],
        edges: [],
        validated: true,
      };

      const result = engine.dispatch(execution, graph);
      expect(result.outcome).toBe('success');
      expect(execution.status).toBe('completed');
    });

    it('emits DispatchFailed event on repo violation', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
          { id: 'c1', type: 'core', name: 'Data-Core', parent_id: 'root', children_ids: ['r1'] },
          { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'c1', children_ids: [] },
        ],
        edges: [],
        validated: true,
      };

      try { engine.dispatch(execution, graph); } catch { /* expected */ }
      const failed = events.find((e) => e.type === 'DispatchFailed');
      expect(failed).toBeTruthy();
      expect(failed!.payload.execution_id).toBe(execution.execution_id.value);
    });

    it('includes violation details in error', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['c1'] },
          { id: 'c1', type: 'core', name: 'Security-Core', parent_id: 'root', children_ids: ['r1'] },
          { id: 'r1', type: 'repo', name: 'CostOps', parent_id: 'c1', children_ids: [] },
        ],
        edges: [],
        validated: true,
      };

      try {
        engine.dispatch(execution, graph);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RepoAssignmentViolationError);
        const violation = (err as RepoAssignmentViolationError).violations[0];
        expect(violation.coreName).toBe('Security-Core');
        expect(violation.repoName).toBe('CostOps');
      }
    });
  });

  describe('graph hierarchy guard', () => {
    it('rejects dispatch when agent is directly under root', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['a1'] },
          { id: 'a1', type: 'agent', name: 'agent-bad', parent_id: 'root', children_ids: [] },
        ],
        edges: [],
        validated: false,
      };

      expect(() => engine.dispatch(execution, graph)).toThrow(GraphHierarchyViolationError);
      expect(execution.status).toBe('failed');
    });

    it('rejects dispatch when repo is directly under root', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['r1'] },
          { id: 'r1', type: 'repo', name: 'Shield', parent_id: 'root', children_ids: [] },
        ],
        edges: [],
        validated: false,
      };

      try {
        engine.dispatch(execution, graph);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GraphHierarchyViolationError);
        const violations = (err as GraphHierarchyViolationError).violations;
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].type).toBe('invalid_parent_child_type');
      }
    });

    it('emits DispatchFailed on hierarchy violation', () => {
      const execution = makeExecution();
      const resolver = new MapCoreResolver(new Map());
      const engine = new SimulationEngine(resolver, spanFactory, eventBus);

      const graph: ExecutionGraph = {
        nodes: [
          { id: 'root', type: 'execution_root', name: 'root', parent_id: null, children_ids: ['a1'] },
          { id: 'a1', type: 'agent', name: 'agent-bad', parent_id: 'root', children_ids: [] },
        ],
        edges: [],
        validated: false,
      };

      try { engine.dispatch(execution, graph); } catch { /* expected */ }
      const failed = events.find((e) => e.type === 'DispatchFailed');
      expect(failed).toBeTruthy();
      expect(failed!.payload.execution_id).toBe(execution.execution_id.value);
    });
  });
});
