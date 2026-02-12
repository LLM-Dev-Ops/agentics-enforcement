import { describe, it, expect } from 'vitest';
import { validateSpanTree } from '../span-tree-validator.js';
import { createSpanTree, addSpanToTree } from '../span-tree.js';
import { createSpan, closeSpan } from '../span.js';
import { SpanFactory } from '../span-factory.js';

function buildValidTree() {
  const factory = new SpanFactory();
  const root = factory.createRootSpan('exec-1', 'cli', 'intent-1');
  const tree = createSpanTree(root);

  const cv = factory.createContractValidationSpan('exec-1', root.span_id, 'intent-1', '0.1.0', 'pass');
  addSpanToTree(tree, cv);

  const core = factory.createCoreSpan('exec-1', root.span_id, 'security-core', ['repo-a']);
  addSpanToTree(tree, core);

  const repo = factory.createRepoSpan('exec-1', core.span_id, 'repo-a');
  addSpanToTree(tree, repo);

  const agent = factory.createAgentSpan('exec-1', repo.span_id, 'agent-1');
  addSpanToTree(tree, agent);

  // Close all spans
  closeSpan(root, true);
  closeSpan(cv, true);
  closeSpan(core, true);
  closeSpan(repo, true);
  closeSpan(agent, true);

  return tree;
}

describe('SpanTreeValidator', () => {
  it('valid tree passes with no violations', () => {
    const tree = buildValidTree();
    const result = validateSpanTree(tree);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports correct span_count', () => {
    const tree = buildValidTree();
    const result = validateSpanTree(tree);
    expect(result.span_count).toBe(5);
  });

  it('reports correct tree_depth (root→core→repo→agent = 4)', () => {
    const tree = buildValidTree();
    const result = validateSpanTree(tree);
    expect(result.tree_depth).toBe(4);
  });

  it('reports orphan_span when parent does not exist in tree', () => {
    const factory = new SpanFactory();
    const root = factory.createRootSpan('exec-1', 'cli', 'i-1');
    const tree = createSpanTree(root);

    // Create a core span referencing a non-existent parent
    const orphan = createSpan({
      parent_span_id: 'span-does-not-exist',
      execution_id: 'exec-1',
      type: 'core',
      attributes: { core_name: 'x', execution_id: 'exec-1', delegated_repos: [] },
    });
    addSpanToTree(tree, orphan);

    closeSpan(root, true);
    closeSpan(orphan, true);

    const result = validateSpanTree(tree);
    expect(result.valid).toBe(false);
    const orphanViolations = result.violations.filter((v) => v.type === 'orphan_span');
    expect(orphanViolations.length).toBeGreaterThan(0);
    expect(orphanViolations[0].span_id).toBe(orphan.span_id);
  });

  it('reports invalid_parent_child_type for wrong hierarchy', () => {
    const factory = new SpanFactory();
    const root = factory.createRootSpan('exec-1', 'cli', 'i-1');
    const tree = createSpanTree(root);

    // agent directly under root (invalid: root → agent is not allowed)
    const agent = factory.createAgentSpan('exec-1', root.span_id, 'agent-bad');
    addSpanToTree(tree, agent);

    closeSpan(root, true);
    closeSpan(agent, true);

    const result = validateSpanTree(tree);
    expect(result.valid).toBe(false);
    const hierarchyViolations = result.violations.filter((v) => v.type === 'invalid_parent_child_type');
    expect(hierarchyViolations.length).toBe(1);
    expect(hierarchyViolations[0].span_id).toBe(agent.span_id);
    expect((hierarchyViolations[0].details as any).parent_type).toBe('execution_root');
    expect((hierarchyViolations[0].details as any).child_type).toBe('agent');
  });

  it('reports unclosed_span for open spans', () => {
    const factory = new SpanFactory();
    const root = factory.createRootSpan('exec-1', 'cli', 'i-1');
    const tree = createSpanTree(root);
    // root is NOT closed

    const result = validateSpanTree(tree);
    expect(result.valid).toBe(false);
    const unclosed = result.violations.filter((v) => v.type === 'unclosed_span');
    expect(unclosed.length).toBe(1);
    expect(unclosed[0].span_id).toBe(root.span_id);
  });

  it('reports execution_id_mismatch', () => {
    const root = createSpan({
      parent_span_id: null,
      execution_id: 'exec-1',
      type: 'execution_root',
      attributes: { execution_id: 'exec-1', caller: 'cli', intent_id: 'i-1' },
    });
    const tree = createSpanTree(root);

    // Manually force a span with wrong execution_id into the tree
    const mismatch = createSpan({
      parent_span_id: root.span_id,
      execution_id: 'exec-1', // must match for addSpanToTree
      type: 'core',
      attributes: { core_name: 'x', execution_id: 'exec-1', delegated_repos: [] },
    });
    addSpanToTree(tree, mismatch);

    // Mutate execution_id to simulate the mismatch (since addSpanToTree guards it)
    (mismatch as any).execution_id = 'exec-WRONG';

    closeSpan(root, true);
    closeSpan(mismatch, true);

    const result = validateSpanTree(tree);
    expect(result.valid).toBe(false);
    const mismatches = result.violations.filter((v) => v.type === 'execution_id_mismatch');
    expect(mismatches.length).toBe(1);
  });

  it('validation never throws — always returns a result', () => {
    const root = createSpan({
      parent_span_id: null,
      execution_id: 'exec-1',
      type: 'execution_root',
      attributes: { execution_id: 'exec-1', caller: 'cli', intent_id: 'i-1' },
    });
    const tree = createSpanTree(root);
    // Leave span open, minimal tree — should not throw
    expect(() => validateSpanTree(tree)).not.toThrow();
  });

  it('reports multiple violations in a single pass', () => {
    const factory = new SpanFactory();
    const root = factory.createRootSpan('exec-1', 'cli', 'i-1');
    const tree = createSpanTree(root);
    // root is open (unclosed_span)

    // agent under root (invalid hierarchy)
    const agent = factory.createAgentSpan('exec-1', root.span_id, 'agent-1');
    addSpanToTree(tree, agent);
    // agent is also open (unclosed_span)

    const result = validateSpanTree(tree);
    expect(result.valid).toBe(false);
    // Should have at least: 2 unclosed_span + 1 invalid_parent_child_type
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('handles failure spans correctly (closed_failure counts as closed)', () => {
    const factory = new SpanFactory();
    const root = factory.createRootSpan('exec-1', 'cli', 'i-1');
    const tree = createSpanTree(root);

    const cv = factory.createContractValidationSpan('exec-1', root.span_id, 'i-1', '0.1.0', 'fail');
    addSpanToTree(tree, cv);

    // Close with failure — still counts as closed
    closeSpan(root, false);
    closeSpan(cv, false);

    const result = validateSpanTree(tree);
    const unclosed = result.violations.filter((v) => v.type === 'unclosed_span');
    expect(unclosed).toHaveLength(0);
  });
});
