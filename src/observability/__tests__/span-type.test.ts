import { describe, it, expect } from 'vitest';
import { SPAN_TYPES, isValidSpanType, VALID_CHILD_TYPES } from '../span-type.js';
import type { SpanType } from '../span-type.js';

describe('SpanType', () => {
  it('SPAN_TYPES contains exactly 5 types', () => {
    expect(SPAN_TYPES).toHaveLength(5);
  });

  it('SPAN_TYPES includes all required types', () => {
    expect(SPAN_TYPES).toContain('execution_root');
    expect(SPAN_TYPES).toContain('contract_validation');
    expect(SPAN_TYPES).toContain('core');
    expect(SPAN_TYPES).toContain('repo');
    expect(SPAN_TYPES).toContain('agent');
  });

  it('isValidSpanType returns true for valid types', () => {
    for (const t of SPAN_TYPES) {
      expect(isValidSpanType(t)).toBe(true);
    }
  });

  it('isValidSpanType returns false for invalid types', () => {
    expect(isValidSpanType('unknown')).toBe(false);
    expect(isValidSpanType('')).toBe(false);
    expect(isValidSpanType('core_execution')).toBe(false);
  });
});

describe('VALID_CHILD_TYPES hierarchy', () => {
  it('execution_root allows contract_validation and core', () => {
    const children = VALID_CHILD_TYPES.get('execution_root');
    expect(children).toEqual(['contract_validation', 'core']);
  });

  it('core allows repo', () => {
    expect(VALID_CHILD_TYPES.get('core')).toEqual(['repo']);
  });

  it('repo allows agent', () => {
    expect(VALID_CHILD_TYPES.get('repo')).toEqual(['agent']);
  });

  it('agent is a leaf node (no children)', () => {
    expect(VALID_CHILD_TYPES.get('agent')).toEqual([]);
  });

  it('contract_validation is a leaf node (no children)', () => {
    expect(VALID_CHILD_TYPES.get('contract_validation')).toEqual([]);
  });

  it('has an entry for every span type', () => {
    for (const t of SPAN_TYPES) {
      expect(VALID_CHILD_TYPES.has(t)).toBe(true);
    }
  });
});
