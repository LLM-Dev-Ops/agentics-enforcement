/**
 * SpanTree — Aggregate Root for the observability domain.
 * DDD-005: Aggregate Root
 *
 * Invariants:
 *   - Exactly one span of type execution_root (the root_span).
 *   - All spans belong to the same execution_id.
 *   - Status: building → complete | broken. No reversal.
 */
import type { Span } from './span.js';

export type TreeStatus = 'building' | 'complete' | 'broken';

export interface SpanTree {
  readonly execution_id: string;
  readonly root_span: Span;
  readonly spans: Span[];
  status: TreeStatus;
  readonly created_at: string;
}

/**
 * Create a new SpanTree from an execution_root span.
 * The root span MUST be of type 'execution_root' with null parent.
 */
export function createSpanTree(rootSpan: Span): SpanTree {
  if (rootSpan.type !== 'execution_root') {
    throw new Error(
      `SpanTree root must be of type 'execution_root', got '${rootSpan.type}'`,
    );
  }
  if (rootSpan.parent_span_id !== null) {
    throw new Error('Root span must have null parent_span_id');
  }
  return {
    execution_id: rootSpan.execution_id,
    root_span: rootSpan,
    spans: [rootSpan],
    status: 'building',
    created_at: new Date().toISOString(),
  };
}

/**
 * Add a span to the tree.
 * Validates execution_id match, no duplicate root, and non-null parent.
 */
export function addSpanToTree(tree: SpanTree, span: Span): void {
  if (span.execution_id !== tree.execution_id) {
    throw new Error(
      `Span execution_id '${span.execution_id}' does not match tree execution_id '${tree.execution_id}'`,
    );
  }
  if (span.type === 'execution_root') {
    throw new Error('Cannot add a second execution_root span to the tree');
  }
  if (span.parent_span_id === null) {
    throw new Error('Non-root span must have a parent_span_id');
  }
  tree.spans.push(span);
}

/**
 * Mark the tree as complete. All spans should be closed.
 */
export function completeSpanTree(tree: SpanTree): void {
  if (tree.status !== 'building') {
    throw new Error(`Cannot complete tree in '${tree.status}' status`);
  }
  tree.status = 'complete';
}

/**
 * Mark the tree as broken due to a structural violation.
 */
export function markSpanTreeBroken(tree: SpanTree): void {
  tree.status = 'broken';
}
