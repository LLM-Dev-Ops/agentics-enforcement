/**
 * SchemaValidationResult + SchemaError — Phase 1 output.
 * DDD-003: Value Objects
 */

export interface SchemaError {
  field: string;
  expected: string;
  actual: string;
  message: string;
}

export interface SchemaValidationResult {
  passed: boolean;
  schema_name: string;
  schema_version: string;
  errors: SchemaError[];
}

export function createPassedResult(
  schema_name: string,
  schema_version: string,
): SchemaValidationResult {
  return { passed: true, schema_name, schema_version, errors: [] };
}

export function createFailedResult(
  schema_name: string,
  schema_version: string,
  errors: SchemaError[],
): SchemaValidationResult {
  return { passed: false, schema_name, schema_version, errors };
}
