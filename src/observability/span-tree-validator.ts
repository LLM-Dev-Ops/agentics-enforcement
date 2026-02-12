/**
 * SpanTreeValidator — Validates a SpanTree for structural correctness.
 * DDD-005: Domain Service
 *
 * Hierarchy is enforced but not yet blocking — violations are returned
 * as warnings in the validation result, not thrown as errors.
 */
import type { SpanTree } from './span-tree.js';
import { VALID_CHILD_TYPES } from './span-type.js';
import type { Span } from './span.js';

export type ViolationType =
  | 'missing_root'
  | 'multiple_roots'
  | 'orphan_span'
  | 'invalid_parent_child_type'
  | 'unclosed_span'
  | 'execution_id_mismatch';

export interface TreeViolation {
  readonly type: ViolationType;
  readonly span_id: string | null;
  readonly message: string;
  readonly details: Record<string, unknown>;
}

export interface TreeValidationResult {
  readonly valid: boolean;
  readonly violations: readonly TreeViolation[];
  readonly span_count: number;
  readonly tree_depth: number;
}

/**
 * Validate a SpanTree for structural correctness.
 * Returns violations as warnings — does NOT throw.
 */
export function validateSpanTree(tree: SpanTree): TreeValidationResult {
  const violations: TreeViolation[] = [];
  const spanIndex = new Map<string, Span>();

  for (const span of tree.spans) {
    spanIndex.set(span.span_id, span);
  }

  // Rule 1: Exactly one execution_root
  const roots = tree.spans.filter((s) => s.type === 'execution_root');
  if (roots.length === 0) {
    violations.push({
      type: 'missing_root',
      span_id: null,
      message: 'SpanTree has no execution_root span',
      details: {},
    });
  } else if (roots.length > 1) {
    violations.push({
      type: 'multiple_roots',
      span_id: roots[1].span_id,
      message: `SpanTree has ${roots.length} execution_root spans, expected 1`,
      details: { root_span_ids: roots.map((r) => r.span_id) },
    });
  }

  // Rule 2: All non-root spans have a parent that exists in the tree
  for (const span of tree.spans) {
    if (span.type === 'execution_root') continue;
    if (span.parent_span_id === null) {
      violations.push({
        type: 'orphan_span',
        span_id: span.span_id,
        message: `Non-root span '${span.span_id}' has null parent_span_id`,
        details: { span_type: span.type },
      });
      continue;
    }
    if (!spanIndex.has(span.parent_span_id)) {
      violations.push({
        type: 'orphan_span',
        span_id: span.span_id,
        message: `Span '${span.span_id}' references parent '${span.parent_span_id}' which does not exist in the tree`,
        details: { parent_span_id: span.parent_span_id, span_type: span.type },
      });
    }
  }

  // Rule 3: Parent-child type relationships match hierarchy rules
  for (const span of tree.spans) {
    if (span.type === 'execution_root') continue;
    if (span.parent_span_id === null) continue;
    const parent = spanIndex.get(span.parent_span_id);
    if (!parent) continue; // already reported as orphan
    const allowedChildren = VALID_CHILD_TYPES.get(parent.type) ?? [];
    if (!allowedChildren.includes(span.type)) {
      violations.push({
        type: 'invalid_parent_child_type',
        span_id: span.span_id,
        message: `Span type '${span.type}' is not a valid child of parent type '${parent.type}'`,
        details: {
          parent_span_id: parent.span_id,
          parent_type: parent.type,
          child_type: span.type,
          allowed_children: [...allowedChildren],
        },
      });
    }
  }

  // Rule 4: All spans have matching execution_id
  for (const span of tree.spans) {
    if (span.execution_id !== tree.execution_id) {
      violations.push({
        type: 'execution_id_mismatch',
        span_id: span.span_id,
        message: `Span execution_id '${span.execution_id}' does not match tree execution_id '${tree.execution_id}'`,
        details: { expected: tree.execution_id, actual: span.execution_id },
      });
    }
  }

  // Rule 5: Check for unclosed spans (warning, not blocking)
  for (const span of tree.spans) {
    if (span.status === 'open') {
      violations.push({
        type: 'unclosed_span',
        span_id: span.span_id,
        message: `Span '${span.span_id}' is still open`,
        details: { span_type: span.type },
      });
    }
  }

  const depth = calculateTreeDepth(tree.spans, spanIndex);

  return {
    valid: violations.length === 0,
    violations,
    span_count: tree.spans.length,
    tree_depth: depth,
  };
}

function calculateTreeDepth(
  spans: readonly Span[],
  index: Map<string, Span>,
): number {
  let maxDepth = 0;
  for (const span of spans) {
    let depth = 0;
    let current: Span | undefined = span;
    const visited = new Set<string>();
    while (current) {
      if (visited.has(current.span_id)) break; // cycle guard
      visited.add(current.span_id);
      depth++;
      if (current.parent_span_id === null) break;
      current = index.get(current.parent_span_id);
    }
    if (depth > maxDepth) maxDepth = depth;
  }
  return maxDepth;
}
