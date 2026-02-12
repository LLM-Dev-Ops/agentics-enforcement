/**
 * Lightweight synchronous domain event bus.
 * DDD-003: Domain Events infrastructure.
 */

export interface DomainEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: DomainEvent) => void;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  emit(event: DomainEvent): void {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const defaultEventBus = new EventBus();
