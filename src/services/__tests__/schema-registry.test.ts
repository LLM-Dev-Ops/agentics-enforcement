import { describe, it, expect } from 'vitest';
import { SchemaRegistry, SchemaNotFoundError } from '../schema-registry.js';

describe('SchemaRegistry', () => {
  const registry = new SchemaRegistry();

  it('getSchema returns a Zod schema for each canonical name', () => {
    const names = [
      'ExecutionIntent', 'ExecutionGraph', 'CoreExecutionResult',
      'EvidenceSummary', 'PolicyDecision', 'CostReference',
    ];
    for (const name of names) {
      const schema = registry.getSchema(name);
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    }
  });

  it('getSchema throws SchemaNotFoundError for unknown name', () => {
    expect(() => registry.getSchema('Bogus')).toThrow(SchemaNotFoundError);
    try {
      registry.getSchema('Bogus');
    } catch (err) {
      const e = err as SchemaNotFoundError;
      expect(e.schema_name).toBe('Bogus');
      expect(e.available_schemas).toContain('ExecutionIntent');
      expect(e.available_schemas).toHaveLength(6);
    }
  });

  it('getSchemaVersion returns 0.1.0', () => {
    expect(registry.getSchemaVersion()).toBe('0.1.0');
  });

  it('validateDependency returns true (all 6 schemas present)', () => {
    expect(registry.validateDependency()).toBe(true);
  });

  describe('validate()', () => {
    const validIntent = {
      id: 'i1', caller: 'c', action: 'simulate', target: 't',
      parameters: {}, metadata: {}, is_meta_simulation: false,
    };

    it('returns passed result for valid data', () => {
      const r = registry.validate('ExecutionIntent', validIntent);
      expect(r.passed).toBe(true);
      expect(r.schema_name).toBe('ExecutionIntent');
      expect(r.schema_version).toBe('0.1.0');
      expect(r.errors).toEqual([]);
    });

    it('returns failed result for empty object', () => {
      const r = registry.validate('ExecutionIntent', {});
      expect(r.passed).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('maps Zod errors to SchemaError format', () => {
      const r = registry.validate('ExecutionIntent', { id: 123 });
      expect(r.passed).toBe(false);
      const idError = r.errors.find((e) => e.field === 'id');
      expect(idError).toBeDefined();
      expect(idError!.message).toBeTruthy();
    });

    it('returns failed result for wrong type', () => {
      const r = registry.validate('ExecutionIntent', {
        ...validIntent, is_meta_simulation: 'yes',
      });
      expect(r.passed).toBe(false);
    });
  });
});
