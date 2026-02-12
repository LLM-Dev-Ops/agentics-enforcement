/**
 * ExecutionRepository — In-memory store for Execution aggregates.
 * DDD-002: Repository
 *
 * Production implementations would back this with a database.
 * This in-memory version is sufficient for the current phase.
 */
import type { Execution } from './execution.js';

export interface ExecutionRepository {
  save(execution: Execution): void;
  findById(executionId: string): Execution | null;
  findActive(): Execution[];
}

export class InMemoryExecutionRepository implements ExecutionRepository {
  private readonly store = new Map<string, Execution>();

  save(execution: Execution): void {
    this.store.set(execution.execution_id.value, execution);
  }

  findById(executionId: string): Execution | null {
    return this.store.get(executionId) ?? null;
  }

  findActive(): Execution[] {
    return [...this.store.values()].filter(
      (e) => e.status !== 'completed' && e.status !== 'failed' && e.status !== 'rejected',
    );
  }

  /** @internal — for testing */
  clear(): void {
    this.store.clear();
  }

  /** @internal — for testing */
  size(): number {
    return this.store.size;
  }
}
