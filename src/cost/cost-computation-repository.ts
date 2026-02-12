/**
 * CostComputationRepository — Persistence interface for CostComputation aggregates.
 * DDD-004: Repository pattern.
 */
import type { CostComputation } from './cost-computation.js';

export interface CostComputationRepository {
  save(computation: CostComputation): void;
  findByRefId(refId: string): CostComputation | null;
  findByExecutionId(executionId: string): CostComputation[];
}

export class InMemoryCostComputationRepository implements CostComputationRepository {
  private readonly store = new Map<string, CostComputation>();

  save(computation: CostComputation): void {
    this.store.set(computation.ref_id, computation);
  }

  findByRefId(refId: string): CostComputation | null {
    return this.store.get(refId) ?? null;
  }

  findByExecutionId(executionId: string): CostComputation[] {
    const results: CostComputation[] = [];
    for (const computation of this.store.values()) {
      if (computation.execution_id === executionId) {
        results.push(computation);
      }
    }
    return results;
  }
}
