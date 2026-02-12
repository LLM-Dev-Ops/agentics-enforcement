import { describe, it, expect } from 'vitest';
import {
  createSpanCreatedEvent,
  createSpanClosedEvent,
  createSpanTreeCompletedEvent,
  createSpanTreeBrokenEvent,
} from '../observability-events.js';

describe('Observability domain events', () => {
  describe('SpanCreated', () => {
    it('has type SpanCreated', () => {
      const event = createSpanCreatedEvent('span-1', 'exec-1', 'execution_root', null);
      expect(event.type).toBe('SpanCreated');
    });

    it('has timestamp', () => {
      const event = createSpanCreatedEvent('span-1', 'exec-1', 'core', 'span-root');
      expect(event.timestamp).toBeTruthy();
    });

    it('includes span_id, execution_id, span_type, parent_span_id in payload', () => {
      const event = createSpanCreatedEvent('span-1', 'exec-1', 'repo', 'span-core');
      expect(event.payload.span_id).toBe('span-1');
      expect(event.payload.execution_id).toBe('exec-1');
      expect(event.payload.span_type).toBe('repo');
      expect(event.payload.parent_span_id).toBe('span-core');
    });

    it('supports null parent_span_id for root spans', () => {
      const event = createSpanCreatedEvent('span-1', 'exec-1', 'execution_root', null);
      expect(event.payload.parent_span_id).toBeNull();
    });
  });

  describe('SpanClosed', () => {
    it('has type SpanClosed', () => {
      const event = createSpanClosedEvent('span-1', 'exec-1', 'closed_success', '2026-01-01T00:00:00.000Z');
      expect(event.type).toBe('SpanClosed');
    });

    it('includes status and ended_at in payload', () => {
      const event = createSpanClosedEvent('span-1', 'exec-1', 'closed_failure', '2026-01-01T12:00:00.000Z');
      expect(event.payload.status).toBe('closed_failure');
      expect(event.payload.ended_at).toBe('2026-01-01T12:00:00.000Z');
    });
  });

  describe('SpanTreeCompleted', () => {
    it('has type SpanTreeCompleted', () => {
      const event = createSpanTreeCompletedEvent('exec-1', 5, 4);
      expect(event.type).toBe('SpanTreeCompleted');
    });

    it('includes span_count and tree_depth', () => {
      const event = createSpanTreeCompletedEvent('exec-1', 10, 3);
      expect(event.payload.execution_id).toBe('exec-1');
      expect(event.payload.span_count).toBe(10);
      expect(event.payload.tree_depth).toBe(3);
    });
  });

  describe('SpanTreeBroken', () => {
    it('has type SpanTreeBroken', () => {
      const event = createSpanTreeBrokenEvent('exec-1', 'orphan_span', { span_id: 'span-orphan' });
      expect(event.type).toBe('SpanTreeBroken');
    });

    it('includes violation_type and details', () => {
      const event = createSpanTreeBrokenEvent('exec-1', 'invalid_parent_child_type', { parent: 'root', child: 'agent' });
      expect(event.payload.violation_type).toBe('invalid_parent_child_type');
      expect(event.payload.details).toEqual({ parent: 'root', child: 'agent' });
    });
  });
});
