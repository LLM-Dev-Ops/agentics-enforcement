/**
 * SchemaRegistry — Anti-corruption layer between Enforcement and Contracts.
 * DDD-003: Domain Service
 *
 * Wraps the raw Zod schema imports from src/contracts/.
 * If the contracts package changes format, only this file needs updating.
 */
import type { ZodTypeAny } from 'zod';
import {
  ExecutionIntentSchema,
  ExecutionGraphSchema,
  CoreExecutionResultSchema,
  EvidenceSummarySchema,
  PolicyDecisionSchema,
  CostReferenceSchema,
  CONTRACTS_VERSION,
  CANONICAL_SCHEMA_NAMES,
} from '../contracts/index.js';
import type { SchemaError, SchemaValidationResult } from '../domain/schema-validation-result.js';
import { createPassedResult, createFailedResult } from '../domain/schema-validation-result.js';

const SCHEMA_MAP = new Map<string, ZodTypeAny>([
  ['ExecutionIntent', ExecutionIntentSchema],
  ['ExecutionGraph', ExecutionGraphSchema],
  ['CoreExecutionResult', CoreExecutionResultSchema],
  ['EvidenceSummary', EvidenceSummarySchema],
  ['PolicyDecision', PolicyDecisionSchema],
  ['CostReference', CostReferenceSchema],
]);

export class SchemaNotFoundError extends Error {
  override readonly name = 'SchemaNotFoundError';
  constructor(
    public readonly schema_name: string,
    public readonly available_schemas: string[],
  ) {
    super(
      `Schema "${schema_name}" not found. Available: ${available_schemas.join(', ')}`,
    );
  }
}

export class SchemaRegistry {
  getSchema(name: string): ZodTypeAny {
    const schema = SCHEMA_MAP.get(name);
    if (!schema) {
      throw new SchemaNotFoundError(name, [...SCHEMA_MAP.keys()]);
    }
    return schema;
  }

  getSchemaVersion(): string {
    return CONTRACTS_VERSION;
  }

  validateDependency(): boolean {
    for (const name of CANONICAL_SCHEMA_NAMES) {
      if (!SCHEMA_MAP.has(name)) return false;
    }
    return true;
  }

  validate(name: string, data: unknown): SchemaValidationResult {
    const schema = this.getSchema(name);
    const version = this.getSchemaVersion();
    const result = schema.safeParse(data);

    if (result.success) {
      return createPassedResult(name, version);
    }

    const errors: SchemaError[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      expected: issue.code === 'invalid_type'
        ? (issue as any).expected ?? 'unknown'
        : issue.code,
      actual: issue.code === 'invalid_type'
        ? (issue as any).received ?? 'unknown'
        : 'invalid',
      message: issue.message,
    }));

    return createFailedResult(name, version, errors);
  }
}
