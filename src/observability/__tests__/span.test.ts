import { describe, it, expect } from 'vitest';
import { createSpan, closeSpan } from '../span.js';
import { InvalidSpanTransitionError } from '../span-status.js';

function makeRootSpan() {
  return createSpan({
    parent_span_id: null,
    execution_id: 'exec-123',
    type: 'execution_root',
    attributes: { execution_id: 'exec-123', caller: 'cli', intent_id: 'i-1' },
  });
}

function makeChildSpan(parent_span_id: string) {
  return createSpan({
    parent_span_id,
    execution_id: 'exec-123',
    type: 'core',
    attributes: { core_name: 'security-core', execution_id: 'exec-123', delegated_repos: [] },
  });
}

describe('createSpan', () => {
  it('produces a span_id with span- prefix', () => {
    const span = makeRootSpan();
    expect(span.span_id).toMatch(/^span-/);
  });

  it('sets status to open', () => {
    expect(makeRootSpan().status).toBe('open');
  });

  it('sets started_at to a valid ISO timestamp', () => {
    const span = makeRootSpan();
    expect(span.started_at).toBeTruthy();
    expect(() => new Date(span.started_at)).not.toThrow();
  });

  it('sets ended_at to null', () => {
    expect(makeRootSpan().ended_at).toBeNull();
  });

  it('preserves execution_id', () => {
    expect(makeRootSpan().execution_id).toBe('exec-123');
  });

  it('preserves parent_span_id', () => {
    expect(makeRootSpan().parent_span_id).toBeNull();
    const child = makeChildSpan('span-parent');
    expect(child.parent_span_id).toBe('span-parent');
  });

  it('preserves type', () => {
    expect(makeRootSpan().type).toBe('execution_root');
  });

  it('preserves attributes', () => {
    const span = makeRootSpan();
    expect((span.attributes as any).caller).toBe('cli');
  });

  it('generates unique span_ids', () => {
    const a = makeRootSpan();
    const b = makeRootSpan();
    expect(a.span_id).not.toBe(b.span_id);
  });
});

describe('closeSpan', () => {
  it('closes with success', () => {
    const span = makeRootSpan();
    closeSpan(span, true);
    expect(span.status).toBe('closed_success');
    expect(span.ended_at).toBeTruthy();
  });

  it('closes with failure', () => {
    const span = makeRootSpan();
    closeSpan(span, false);
    expect(span.status).toBe('closed_failure');
    expect(span.ended_at).toBeTruthy();
  });

  it('throws when closing an already-closed span (success)', () => {
    const span = makeRootSpan();
    closeSpan(span, true);
    expect(() => closeSpan(span, true)).toThrow(InvalidSpanTransitionError);
  });

  it('throws when closing an already-closed span (failure)', () => {
    const span = makeRootSpan();
    closeSpan(span, false);
    expect(() => closeSpan(span, true)).toThrow(InvalidSpanTransitionError);
  });
});
