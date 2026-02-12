import { describe, it, expect } from 'vitest';
import {
  createPassedResult,
  createFailedResult,
} from '../schema-validation-result.js';
import {
  createAllowed,
  createBlocked,
} from '../enforcement-result.js';
import type { BlockReason } from '../block-reason.js';

describe('SchemaValidationResult factories', () => {
  it('createPassedResult sets passed=true and empty errors', () => {
    const r = createPassedResult('ExecutionIntent', '0.1.0');
    expect(r.passed).toBe(true);
    expect(r.schema_name).toBe('ExecutionIntent');
    expect(r.schema_version).toBe('0.1.0');
    expect(r.errors).toEqual([]);
  });

  it('createFailedResult sets passed=false and includes errors', () => {
    const errors = [
      { field: 'id', expected: 'string', actual: 'undefined', message: 'Required' },
    ];
    const r = createFailedResult('ExecutionIntent', '0.1.0', errors);
    expect(r.passed).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].field).toBe('id');
  });
});

describe('EnforcementResult factories', () => {
  it('createAllowed sets outcome=allowed and null block_reason', () => {
    const r = createAllowed('intent-1', 'decision-1');
    expect(r.outcome).toBe('allowed');
    expect(r.intent_id).toBe('intent-1');
    expect(r.decision_id).toBe('decision-1');
    expect(r.block_reason).toBeNull();
  });

  it('createBlocked sets outcome=blocked with block_reason', () => {
    const reason: BlockReason = {
      phase: 'schema_validation',
      code: 'test',
      message: 'fail',
      details: {},
    };
    const r = createBlocked('intent-1', 'decision-1', reason);
    expect(r.outcome).toBe('blocked');
    expect(r.block_reason).toBe(reason);
    expect(r.block_reason!.phase).toBe('schema_validation');
  });
});
