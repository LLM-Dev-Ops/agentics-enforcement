import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus, type DomainEvent } from '../event-bus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('emits events to subscribed handlers', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('TestEvent', (e) => received.push(e));

    const event: DomainEvent = {
      type: 'TestEvent',
      timestamp: new Date().toISOString(),
      payload: { key: 'value' },
    };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('does not emit to unsubscribed event types', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('TypeA', (e) => received.push(e));

    bus.emit({ type: 'TypeB', timestamp: '', payload: {} });
    expect(received).toHaveLength(0);
  });

  it('multiple handlers for same event type all receive the event', () => {
    let count = 0;
    bus.subscribe('Ev', () => count++);
    bus.subscribe('Ev', () => count++);
    bus.subscribe('Ev', () => count++);

    bus.emit({ type: 'Ev', timestamp: '', payload: {} });
    expect(count).toBe(3);
  });

  it('clear() removes all subscriptions', () => {
    const received: DomainEvent[] = [];
    bus.subscribe('Ev', (e) => received.push(e));
    bus.clear();

    bus.emit({ type: 'Ev', timestamp: '', payload: {} });
    expect(received).toHaveLength(0);
  });
});
