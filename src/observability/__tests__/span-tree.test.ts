import { describe, it, expect } from 'vitest';
import { createSpanTree, addSpanToTree, completeSpanTree, markSpanTreeBroken } from '../span-tree.js';
import { createSpan } from '../span.js';

function makeRootSpan(execId = 'exec-1') {
  return createSpan({
    parent_span_id: null,
    execution_id: execId,
    type: 'execution_root',
    attributes: { execution_id: execId, caller: 'cli', intent_id: 'i-1' },
  });
}

function makeCoreSpan(parentId: string, execId = 'exec-1') {
  return createSpan({
    parent_span_id: parentId,
    execution_id: execId,
    type: 'core',
    attributes: { core_name: 'security-core', execution_id: execId, delegated_repos: [] },
  });
}

describe('createSpanTree', () => {
  it('creates a tree from an execution_root span', () => {
    const root = makeRootSpan();
    const tree = createSpanTree(root);
    expect(tree.execution_id).toBe('exec-1');
    expect(tree.root_span).toBe(root);
  });

  it('starts in building status', () => {
    const tree = createSpanTree(makeRootSpan());
    expect(tree.status).toBe('building');
  });

  it('has spans array containing only the root', () => {
    const root = makeRootSpan();
    const tree = createSpanTree(root);
    expect(tree.spans).toHaveLength(1);
    expect(tree.spans[0]).toBe(root);
  });

  it('has a created_at timestamp', () => {
    const tree = createSpanTree(makeRootSpan());
    expect(tree.created_at).toBeTruthy();
  });

  it('throws if given a non-root span type', () => {
    const core = createSpan({
      parent_span_id: 'span-parent',
      execution_id: 'exec-1',
      type: 'core',
      attributes: { core_name: 'x', execution_id: 'exec-1', delegated_repos: [] },
    });
    expect(() => createSpanTree(core)).toThrow('execution_root');
  });

  it('throws if root span has non-null parent_span_id', () => {
    // Force a root-type span with a parent
    const badRoot = createSpan({
      parent_span_id: 'span-bad',
      execution_id: 'exec-1',
      type: 'execution_root',
      attributes: { execution_id: 'exec-1', caller: 'cli', intent_id: 'i-1' },
    });
    expect(() => createSpanTree(badRoot)).toThrow('null parent_span_id');
  });
});

describe('addSpanToTree', () => {
  it('adds a child span to the spans array', () => {
    const root = makeRootSpan();
    const tree = createSpanTree(root);
    const core = makeCoreSpan(root.span_id);
    addSpanToTree(tree, core);
    expect(tree.spans).toHaveLength(2);
    expect(tree.spans[1]).toBe(core);
  });

  it('throws if execution_id does not match', () => {
    const tree = createSpanTree(makeRootSpan('exec-1'));
    const mismatch = makeCoreSpan('span-parent', 'exec-999');
    expect(() => addSpanToTree(tree, mismatch)).toThrow('does not match');
  });

  it('throws if adding a second execution_root', () => {
    const tree = createSpanTree(makeRootSpan());
    const secondRoot = makeRootSpan();
    // secondRoot has null parent, so we need to test the root type check specifically
    expect(() => addSpanToTree(tree, secondRoot)).toThrow('second execution_root');
  });

  it('throws if non-root span has null parent_span_id', () => {
    const tree = createSpanTree(makeRootSpan());
    const orphan = createSpan({
      parent_span_id: null,
      execution_id: 'exec-1',
      type: 'core',
      attributes: { core_name: 'x', execution_id: 'exec-1', delegated_repos: [] },
    });
    expect(() => addSpanToTree(tree, orphan)).toThrow('parent_span_id');
  });
});

describe('completeSpanTree', () => {
  it('sets status to complete', () => {
    const tree = createSpanTree(makeRootSpan());
    completeSpanTree(tree);
    expect(tree.status).toBe('complete');
  });

  it('throws if tree is not in building status', () => {
    const tree = createSpanTree(makeRootSpan());
    completeSpanTree(tree);
    expect(() => completeSpanTree(tree)).toThrow('complete');
  });
});

describe('markSpanTreeBroken', () => {
  it('sets status to broken', () => {
    const tree = createSpanTree(makeRootSpan());
    markSpanTreeBroken(tree);
    expect(tree.status).toBe('broken');
  });
});
