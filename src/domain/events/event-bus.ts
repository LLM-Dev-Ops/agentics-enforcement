/**
 * Lightweight synchronous domain event bus.
 * DDD-003: Domain Events infrastructure.
 *
 * Error handling:
 *   - Handler errors MUST propagate upward — NO silent swallowing.
 *   - On handler failure, logs execution_id and repo_name from event payload.
 *   - Errors bubble to the caller of emit().
 */

export interface DomainEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: DomainEvent) => void;

export class EventHandlerError extends Error {
  override readonly name = 'EventHandlerError';
  constructor(
    public readonly eventType: string,
    public readonly execution_id: string | undefined,
    public readonly repo_name: string | undefined,
    public readonly cause_error: Error,
  ) {
    super(
      `Event handler failed for '${eventType}'` +
      (execution_id ? ` [execution_id: ${execution_id}]` : '') +
      (repo_name ? ` [repo_name: ${repo_name}]` : '') +
      `: ${cause_error.message}`,
    );
  }
}

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Emit a domain event to all subscribed handlers.
   * Errors from handlers are NOT silently swallowed — they propagate as
   * EventHandlerError with execution_id and repo_name for diagnostics.
   */
  emit(event: DomainEvent): void {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        const execution_id = typeof event.payload.execution_id === 'string'
          ? event.payload.execution_id
          : undefined;
        const repo_name = typeof event.payload.repo_name === 'string'
          ? event.payload.repo_name
          : undefined;
        throw new EventHandlerError(
          event.type,
          execution_id,
          repo_name,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const defaultEventBus = new EventBus();
