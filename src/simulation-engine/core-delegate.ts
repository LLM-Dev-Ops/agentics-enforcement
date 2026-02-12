/**
 * CoreDelegate — The delegation contract for Tier-3 Cores.
 * ADR-005: Simulation engine delegates ALL work to cores.
 *
 * Concrete delegates live in their respective core repos.
 * InMemoryStubDelegate is provided for testing only.
 */
import type { GraphNode, CoreExecutionResult } from '../contracts/index.js';

export interface CoreDelegate {
  execute(
    coreName: string,
    executionId: string,
    nodes: GraphNode[],
  ): CoreExecutionResult;
}

export class InMemoryStubDelegate implements CoreDelegate {
  constructor(private readonly stubbedResult: CoreExecutionResult) {}

  execute(): CoreExecutionResult {
    return this.stubbedResult;
  }
}
