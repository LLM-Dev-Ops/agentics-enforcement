/**
 * CoreResolver — Resolves core names to their delegates.
 * ADR-005: The simulation engine resolves which Core handles each step.
 */
import type { CoreDelegate } from './core-delegate.js';

export interface CoreResolver {
  resolve(coreName: string): CoreDelegate | null;
}

export class MapCoreResolver implements CoreResolver {
  constructor(private readonly delegates: ReadonlyMap<string, CoreDelegate>) {}

  resolve(coreName: string): CoreDelegate | null {
    return this.delegates.get(coreName) ?? null;
  }
}
