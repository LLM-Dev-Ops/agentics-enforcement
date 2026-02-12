import { describe, it, expect } from 'vitest';
import {
  ExecutionIntentSchema,
  ExecutionGraphSchema,
  GraphNodeSchema,
  GraphEdgeSchema,
  CoreExecutionResultSchema,
  EvidenceSummarySchema,
  EvidenceEntrySchema,
  PolicyDecisionSchema,
  CostReferenceSchema,
  CONTRACTS_VERSION,
  CANONICAL_SCHEMA_NAMES,
  NodeType,
  ResultStatus,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO_NOW = new Date().toISOString();

const validIntent = {
  id: 'intent-1',
  caller: 'cli-user',
  action: 'simulate',
  target: 'security-core',
  parameters: { depth: 3 },
  metadata: { source: 'test' },
  is_meta_simulation: false,
};

const validEvidence = {
  execution_id: 'exec-1',
  entries: [
    { timestamp: ISO_NOW, layer: 'enforcement', action: 'validate', detail: {} },
  ],
};

const validCostRef = {
  ref_id: 'cost-ref-1',
  computed_at: ISO_NOW,
};

const validCoreResult = {
  core_name: 'Security-Core',
  execution_id: 'exec-1',
  status: 'success' as const,
  evidence: validEvidence,
  cost_ref: validCostRef,
  outputs: { report: 'clean' },
};

const validGraph = {
  nodes: [
    { id: 'root', type: 'execution_root' as const, name: 'root', parent_id: null, children_ids: ['c1'] },
    { id: 'c1', type: 'core' as const, name: 'Security-Core', parent_id: 'root', children_ids: [] },
  ],
  edges: [{ from: 'root', to: 'c1' }],
};

const validPolicyDecision = {
  decision: 'allow' as const,
  rationale: 'All rules passed',
  rule_id: null,
  evaluated_at: ISO_NOW,
};

// ---------------------------------------------------------------------------
// Module-level assertions
// ---------------------------------------------------------------------------

describe('Contract Context metadata', () => {
  it('exports a semver contracts version', () => {
    expect(CONTRACTS_VERSION).toBe('0.1.0');
  });

  it('exports all 6 canonical schema names', () => {
    expect(CANONICAL_SCHEMA_NAMES).toEqual([
      'ExecutionIntent',
      'ExecutionGraph',
      'CoreExecutionResult',
      'EvidenceSummary',
      'PolicyDecision',
      'CostReference',
    ]);
  });
});

// ---------------------------------------------------------------------------
// #1 ExecutionIntent
// ---------------------------------------------------------------------------

describe('ExecutionIntentSchema', () => {
  it('parses valid intent', () => {
    const result = ExecutionIntentSchema.safeParse(validIntent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('intent-1');
      expect(result.data.is_meta_simulation).toBe(false);
    }
  });

  it('applies defaults for optional fields', () => {
    const minimal = { id: 'x', caller: 'y', action: 'z', target: 'w' };
    const result = ExecutionIntentSchema.parse(minimal);
    expect(result.parameters).toEqual({});
    expect(result.metadata).toEqual({});
    expect(result.is_meta_simulation).toBe(false);
  });

  it('rejects missing required field: id', () => {
    const bad = { ...validIntent, id: undefined };
    expect(ExecutionIntentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty string for caller', () => {
    const bad = { ...validIntent, caller: '' };
    expect(ExecutionIntentSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects wrong type for is_meta_simulation', () => {
    const bad = { ...validIntent, is_meta_simulation: 'yes' };
    expect(ExecutionIntentSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #2 ExecutionGraph
// ---------------------------------------------------------------------------

describe('ExecutionGraphSchema', () => {
  it('parses valid graph', () => {
    const result = ExecutionGraphSchema.safeParse(validGraph);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nodes).toHaveLength(2);
      expect(result.data.validated).toBe(false); // default
    }
  });

  it('applies validated default to false', () => {
    const result = ExecutionGraphSchema.parse(validGraph);
    expect(result.validated).toBe(false);
  });

  it('rejects unknown node type', () => {
    const bad = {
      ...validGraph,
      nodes: [{ id: 'x', type: 'unknown', name: 'bad', parent_id: null, children_ids: [] }],
    };
    expect(ExecutionGraphSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts all valid NodeType values', () => {
    for (const t of ['execution_root', 'core', 'repo', 'agent'] as const) {
      const node = GraphNodeSchema.safeParse({
        id: 'n', type: t, name: 'test', parent_id: null, children_ids: [],
      });
      expect(node.success).toBe(true);
    }
  });

  it('rejects missing edge fields', () => {
    expect(GraphEdgeSchema.safeParse({ from: 'a' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #3 CoreExecutionResult
// ---------------------------------------------------------------------------

describe('CoreExecutionResultSchema', () => {
  it('parses valid result', () => {
    const result = CoreExecutionResultSchema.safeParse(validCoreResult);
    expect(result.success).toBe(true);
  });

  it('accepts null cost_ref', () => {
    const noCost = { ...validCoreResult, cost_ref: null };
    const result = CoreExecutionResultSchema.safeParse(noCost);
    expect(result.success).toBe(true);
  });

  it('accepts all ResultStatus values', () => {
    for (const s of ['success', 'failure', 'partial'] as const) {
      const r = CoreExecutionResultSchema.safeParse({ ...validCoreResult, status: s });
      expect(r.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const bad = { ...validCoreResult, status: 'unknown' };
    expect(CoreExecutionResultSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #4 EvidenceSummary
// ---------------------------------------------------------------------------

describe('EvidenceSummarySchema', () => {
  it('parses valid evidence', () => {
    expect(EvidenceSummarySchema.safeParse(validEvidence).success).toBe(true);
  });

  it('rejects missing execution_id', () => {
    expect(EvidenceSummarySchema.safeParse({ entries: [] }).success).toBe(false);
  });

  it('rejects entry with invalid timestamp', () => {
    const bad = {
      execution_id: 'x',
      entries: [{ timestamp: 'not-a-date', layer: 'l', action: 'a', detail: {} }],
    };
    expect(EvidenceSummarySchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #5 PolicyDecision
// ---------------------------------------------------------------------------

describe('PolicyDecisionSchema', () => {
  it('parses valid allow decision', () => {
    const result = PolicyDecisionSchema.safeParse(validPolicyDecision);
    expect(result.success).toBe(true);
  });

  it('parses valid deny decision', () => {
    const deny = { ...validPolicyDecision, decision: 'deny', rule_id: 'rule-1' };
    expect(PolicyDecisionSchema.safeParse(deny).success).toBe(true);
  });

  it('rejects invalid decision value', () => {
    const bad = { ...validPolicyDecision, decision: 'maybe' };
    expect(PolicyDecisionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing rationale', () => {
    const { rationale, ...noRationale } = validPolicyDecision;
    expect(PolicyDecisionSchema.safeParse(noRationale).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #6 CostReference
// ---------------------------------------------------------------------------

describe('CostReferenceSchema', () => {
  it('parses valid cost reference', () => {
    expect(CostReferenceSchema.safeParse(validCostRef).success).toBe(true);
  });

  it('rejects empty ref_id', () => {
    expect(CostReferenceSchema.safeParse({ ref_id: '', computed_at: ISO_NOW }).success).toBe(false);
  });

  it('rejects invalid datetime', () => {
    expect(CostReferenceSchema.safeParse({ ref_id: 'x', computed_at: 'bad' }).success).toBe(false);
  });

  it('rejects completely empty object', () => {
    expect(CostReferenceSchema.safeParse({}).success).toBe(false);
  });
});
