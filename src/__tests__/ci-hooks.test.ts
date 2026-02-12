import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_DIR = join(process.cwd(), '.test-fixtures');
const CLEAN_DIR = join(FIXTURE_DIR, 'clean');
const VIOLATION_DIR = join(FIXTURE_DIR, 'violations');
const COST_CLEAN_DIR = join(FIXTURE_DIR, 'cost-clean');
const COST_VIOLATION_DIR = join(FIXTURE_DIR, 'cost-violations');
const COST_EXEMPT_DIR = join(FIXTURE_DIR, 'cost-exempt');
const SPAN_CLEAN_DIR = join(FIXTURE_DIR, 'span-clean');
const SPAN_WARN_DIR = join(FIXTURE_DIR, 'span-warn');
const SPAN_UTIL_DIR = join(FIXTURE_DIR, 'span-util');
const HIERARCHY_CLEAN_DIR = join(FIXTURE_DIR, 'hierarchy-clean');
const HIERARCHY_VIOLATION_DIR = join(FIXTURE_DIR, 'hierarchy-violations');

beforeAll(() => {
  // Create clean fixture — no schema definitions
  mkdirSync(join(CLEAN_DIR), { recursive: true });
  writeFileSync(
    join(CLEAN_DIR, 'handler.ts'),
    `import { ExecutionIntent } from '@agentics/contracts';\n\nexport function handle(intent: ExecutionIntent) { return intent; }\n`,
  );
  writeFileSync(
    join(CLEAN_DIR, 'utils.ts'),
    `export function formatId(id: string) { return id.toUpperCase(); }\n`,
  );

  // --- Cost-calculation-check fixtures ---

  // Cost clean fixture — no forbidden cost patterns
  mkdirSync(COST_CLEAN_DIR, { recursive: true });
  writeFileSync(
    join(COST_CLEAN_DIR, 'handler.ts'),
    `import { CostReference } from '@agentics/contracts';\n\nexport function handle(ref: CostReference) { return ref.ref_id; }\n`,
  );

  // Cost violation fixture — contains forbidden cost patterns
  mkdirSync(COST_VIOLATION_DIR, { recursive: true });
  writeFileSync(
    join(COST_VIOLATION_DIR, 'bad-cost.ts'),
    `const total = calculateCost(params);\nconsole.log(total);\n`,
  );
  writeFileSync(
    join(COST_VIOLATION_DIR, 'bad-pricing.ts'),
    `const rate = price_per_token * quantity;\nconst table = providerPricingTable['openai'];\n`,
  );

  // Cost exempt fixture — meta-simulation annotated file
  mkdirSync(COST_EXEMPT_DIR, { recursive: true });
  writeFileSync(
    join(COST_EXEMPT_DIR, 'sim-cost.ts'),
    `// @tier1-meta-simulation\nconst total = calculateCost(params);\nconst rate = price_per_token;\n`,
  );

  // --- span-emission-check fixtures ---

  // Span clean: execution-participating file WITH span calls
  mkdirSync(SPAN_CLEAN_DIR, { recursive: true });
  writeFileSync(
    join(SPAN_CLEAN_DIR, 'handler.ts'),
    `import { SpanFactory } from '../observability';\nconst factory = new SpanFactory();\nexport function handle(execution_id: string) { factory.createRootSpan(execution_id, 'cli', 'i-1'); }\n`,
  );

  // Span warn: execution-participating file WITHOUT span calls
  mkdirSync(SPAN_WARN_DIR, { recursive: true });
  writeFileSync(
    join(SPAN_WARN_DIR, 'handler.ts'),
    `export function handle(execution_id: string) { return execution_id; }\n`,
  );

  // Span util: pure utility file (no execution keywords) — should NOT be flagged
  mkdirSync(SPAN_UTIL_DIR, { recursive: true });
  writeFileSync(
    join(SPAN_UTIL_DIR, 'utils.ts'),
    `export function formatId(id: string) { return id.toUpperCase(); }\n`,
  );

  // --- hierarchy-violation-check fixtures ---

  // Hierarchy clean: foundational repo code without orchestration patterns
  mkdirSync(HIERARCHY_CLEAN_DIR, { recursive: true });
  writeFileSync(
    join(HIERARCHY_CLEAN_DIR, 'service.ts'),
    `export function processData(data: unknown) { return data; }\n`,
  );

  // Hierarchy violations: orchestration patterns in foundational repo code
  mkdirSync(HIERARCHY_VIOLATION_DIR, { recursive: true });
  writeFileSync(
    join(HIERARCHY_VIOLATION_DIR, 'bad-orchestration.ts'),
    `const id = mintExecutionId();\nconst exec = createExecution(id, intent, span);\n`,
  );
  writeFileSync(
    join(HIERARCHY_VIOLATION_DIR, 'bad-engine.ts'),
    `const engine = new SimulationEngine(resolver, spanFactory);\nengine.dispatch(execution, graph);\n`,
  );

  // Create violation fixture — redefines canonical schemas
  mkdirSync(join(VIOLATION_DIR), { recursive: true });
  writeFileSync(
    join(VIOLATION_DIR, 'bad-intent.ts'),
    `export interface ExecutionIntent {\n  id: string;\n  action: string;\n}\n`,
  );
  writeFileSync(
    join(VIOLATION_DIR, 'bad-policy.ts'),
    `export type PolicyDecision = {\n  decision: string;\n};\n`,
  );
  writeFileSync(
    join(VIOLATION_DIR, 'ok-import.ts'),
    `import { CostReference } from '@agentics/contracts';\nexport function use(c: CostReference) { return c; }\n`,
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function runHook(script: string, args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${script} ${args}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || '',
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// schema-duplication-check
// ---------------------------------------------------------------------------

describe('schema-duplication-check', () => {
  it('passes on clean directory with no schema definitions', () => {
    const result = runHook('scripts/schema-duplication-check.ts', CLEAN_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('fails when directory contains schema redefinitions', () => {
    const result = runHook('scripts/schema-duplication-check.ts', VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ExecutionIntent');
    expect(result.stderr).toContain('PolicyDecision');
  });

  it('does not flag import statements as violations', () => {
    const result = runHook('scripts/schema-duplication-check.ts', VIOLATION_DIR);
    // ok-import.ts imports CostReference — should NOT appear in violations
    expect(result.stderr).not.toContain('ok-import.ts');
  });

  it('reports correct violation count', () => {
    const result = runHook('scripts/schema-duplication-check.ts', VIOLATION_DIR);
    expect(result.stderr).toContain('2 violation(s)');
  });

  it('passes when scanning contracts dir itself with exclusion', () => {
    const result = runHook(
      'scripts/schema-duplication-check.ts',
      `${process.cwd()}/src contracts`,
    );
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// contract-import-check
// ---------------------------------------------------------------------------

describe('contract-import-check', () => {
  it('passes on the current src/ directory (no local redefinitions outside contracts)', () => {
    const result = runHook('scripts/contract-import-check.ts', `${process.cwd()}/src`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });
});

// ---------------------------------------------------------------------------
// cost-calculation-check
// ---------------------------------------------------------------------------

describe('cost-calculation-check', () => {
  it('passes on clean directory with no forbidden cost patterns', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_CLEAN_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('fails when directory contains calculateCost() calls', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('direct cost calculation call');
  });

  it('fails when directory contains price_per_token references', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('token pricing reference');
  });

  it('fails when directory contains providerPricingTable references', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('provider pricing table reference');
  });

  it('reports correct violation count', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_VIOLATION_DIR);
    // bad-cost.ts: calculateCost (1), bad-pricing.ts: price_per_token (1) + providerPricingTable (1) = 3
    expect(result.stderr).toContain('3 violation(s)');
  });

  it('exempts files with @tier1-meta-simulation annotation', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_EXEMPT_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exempts test files', () => {
    // Create a temp dir with a test file containing forbidden patterns
    const testExemptDir = join(FIXTURE_DIR, 'cost-test-exempt');
    mkdirSync(testExemptDir, { recursive: true });
    writeFileSync(
      join(testExemptDir, 'cost.test.ts'),
      `const total = calculateCost(params);\n`,
    );
    writeFileSync(
      join(testExemptDir, 'real-code.ts'),
      `export function clean() { return 1; }\n`,
    );

    const result = runHook('scripts/cost-calculation-check.ts', testExemptDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('passes when scanning src/cost with exclusion', () => {
    const result = runHook(
      'scripts/cost-calculation-check.ts',
      `${process.cwd()}/src cost`,
    );
    expect(result.exitCode).toBe(0);
  });

  it('reports ADR-007 guidance in error output', () => {
    const result = runHook('scripts/cost-calculation-check.ts', COST_VIOLATION_DIR);
    expect(result.stderr).toContain('ADR-007');
    expect(result.stderr).toContain('CostReference');
  });
});

// ---------------------------------------------------------------------------
// span-emission-check
// ---------------------------------------------------------------------------

describe('span-emission-check', () => {
  it('passes on directory where execution-participating files have span calls', () => {
    const result = runHook('scripts/span-emission-check.ts', SPAN_CLEAN_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('warns on execution handler files missing span calls', () => {
    const result = runHook('scripts/span-emission-check.ts', SPAN_WARN_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('WARN');
    expect(result.stdout).toContain('handler.ts');
  });

  it('does not warn on pure utility files without execution keywords', () => {
    const result = runHook('scripts/span-emission-check.ts', SPAN_UTIL_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exempts test files', () => {
    const testDir = join(FIXTURE_DIR, 'span-test-exempt');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'handler.test.ts'),
      `export function handle(execution_id: string) { return execution_id; }\n`,
    );
    writeFileSync(
      join(testDir, 'clean.ts'),
      `export function clean() { return 1; }\n`,
    );

    const result = runHook('scripts/span-emission-check.ts', testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exempts meta-simulation files', () => {
    const metaDir = join(FIXTURE_DIR, 'span-meta-exempt');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, 'sim-handler.ts'),
      `// @tier1-meta-simulation\nexport function handle(execution_id: string) { return execution_id; }\n`,
    );

    const result = runHook('scripts/span-emission-check.ts', metaDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('always exits 0 (warn severity, never blocks)', () => {
    const result = runHook('scripts/span-emission-check.ts', SPAN_WARN_DIR);
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hierarchy-violation-check
// ---------------------------------------------------------------------------

describe('hierarchy-violation-check', () => {
  it('passes on clean foundational repo code', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_CLEAN_DIR);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('fails on mintExecutionId() calls', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('execution_id generation');
  });

  it('fails on new SimulationEngine() instantiation', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('direct simulation engine instantiation');
  });

  it('fails on createExecution() calls', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('execution creation');
  });

  it('fails on .dispatch() calls', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('direct dispatch call');
  });

  it('reports correct violation count', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    // bad-orchestration.ts: mintExecutionId (1) + createExecution (1)
    // bad-engine.ts: new SimulationEngine (1) + .dispatch (1) = 4 total
    expect(result.stderr).toContain('4 violation(s)');
  });

  it('exempts test files', () => {
    const testDir = join(FIXTURE_DIR, 'hierarchy-test-exempt');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'engine.test.ts'),
      `const engine = new SimulationEngine(resolver, spanFactory);\nengine.dispatch(execution, graph);\n`,
    );
    writeFileSync(
      join(testDir, 'clean.ts'),
      `export function processData() { return 1; }\n`,
    );

    const result = runHook('scripts/hierarchy-violation-check.ts', testDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exempts meta-simulation files', () => {
    const metaDir = join(FIXTURE_DIR, 'hierarchy-meta-exempt');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, 'sim-engine.ts'),
      `// @tier1-meta-simulation\nconst engine = new SimulationEngine(resolver, spanFactory);\n`,
    );

    const result = runHook('scripts/hierarchy-violation-check.ts', metaDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('reports ADR-010 guidance in error output', () => {
    const result = runHook('scripts/hierarchy-violation-check.ts', HIERARCHY_VIOLATION_DIR);
    expect(result.stderr).toContain('ADR-010');
    expect(result.stderr).toContain('Tier-2');
  });
});
