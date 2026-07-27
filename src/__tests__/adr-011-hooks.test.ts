import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Each assertion spawns a real hook process; the default 5s timeout is too tight.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const FIXTURE_DIR = join(process.cwd(), '.test-fixtures-adr011');

const MOCK_CLEAN = join(FIXTURE_DIR, 'mock-clean');
const MOCK_NULLISH = join(FIXTURE_DIR, 'mock-nullish');
const MOCK_REGISTRY = join(FIXTURE_DIR, 'mock-registry');
const MOCK_TEST_ONLY = join(FIXTURE_DIR, 'mock-test-only');
const MOCK_NO_ENTRY = join(FIXTURE_DIR, 'mock-no-entry');

const TELEM_CLEAN = join(FIXTURE_DIR, 'telemetry-clean');
const TELEM_LITERAL = join(FIXTURE_DIR, 'telemetry-literal');
const TELEM_EMPTY_TRY = join(FIXTURE_DIR, 'telemetry-empty-try');
const TELEM_EXEMPT = join(FIXTURE_DIR, 'telemetry-exempt');

function runHook(script: string, args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    // Same invocation as the package.json `check:*` scripts.
    const stdout = execSync(`node --import tsx ${script} ${args}`, {
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

beforeAll(() => {
  // --- mock-default-check fixtures ---

  // Clean: server builds its core registry from environment configuration and
  // fails closed when it is absent (ADR-011 Decision 4).
  mkdirSync(MOCK_CLEAN, { recursive: true });
  writeFileSync(
    join(MOCK_CLEAN, 'server.ts'),
    `import { createCoreRegistry } from './real-registry.js';\n` +
      `const registry = createCoreRegistry(process.env);\n` +
      `app.listen(8080);\n`,
  );
  writeFileSync(
    join(MOCK_CLEAN, 'real-registry.ts'),
    `export function createCoreRegistry(env: NodeJS.ProcessEnv) {\n` +
      `  if (!env.SECURITY_CORE_URL) throw new Error('SECURITY_CORE_URL is required');\n` +
      `  return { security: env.SECURITY_CORE_URL };\n` +
      `}\n`,
  );

  // Violation: mock instance as a nullish default, in a file reachable from the
  // entrypoint via a relative import.
  mkdirSync(MOCK_NULLISH, { recursive: true });
  writeFileSync(
    join(MOCK_NULLISH, 'server.ts'),
    `import { Listener } from './listener.js';\napp.listen(8080);\n`,
  );
  writeFileSync(
    join(MOCK_NULLISH, 'listener.ts'),
    `export class Listener {\n` +
      `  constructor(coreClients?: Registry) {\n` +
      `    this.coreClients = coreClients ?? createMockCoreClientRegistry();\n` +
      `    this.vault = vault ?? new MockSecureVault();\n` +
      `  }\n` +
      `}\n`,
  );

  // Violation: the exact agentics-orchestration-engine shape cited by ADR-011
  // Verification 2 — server.ts importing integration/cores/mock-cores.js and
  // assigning the mock registry directly.
  mkdirSync(join(MOCK_REGISTRY, 'integration', 'cores'), { recursive: true });
  writeFileSync(
    join(MOCK_REGISTRY, 'server.ts'),
    `import { createMockCoreClientRegistry } from './integration/cores/mock-cores.js';\n` +
      `const ruvectorClient = createRuvectorClientFromEnv();\n` +
      `const coreClients = createMockCoreClientRegistry();\n` +
      `engine.initialize(ruvectorClient, coreClients);\n` +
      `app.listen(8080);\n`,
  );
  writeFileSync(
    join(MOCK_REGISTRY, 'integration', 'cores', 'mock-cores.ts'),
    `export function createMockCoreClientRegistry() {\n  return {};\n}\n`,
  );

  // Clean: a mock factory exists and is imported ONLY by a test file. ADR-011
  // keeps these exported for tests, so it must not be flagged.
  mkdirSync(MOCK_TEST_ONLY, { recursive: true });
  writeFileSync(
    join(MOCK_TEST_ONLY, 'server.ts'),
    `import { createCoreRegistry } from './real-registry.js';\napp.listen(8080);\n`,
  );
  writeFileSync(
    join(MOCK_TEST_ONLY, 'real-registry.ts'),
    `export function createCoreRegistry() {\n  return {};\n}\n`,
  );
  writeFileSync(
    join(MOCK_TEST_ONLY, 'mock-vault.ts'),
    `export function createMockSecureVault() {\n  return { resolve: () => 'x' };\n}\n`,
  );
  writeFileSync(
    join(MOCK_TEST_ONLY, 'vault.test.ts'),
    `import { createMockSecureVault } from './mock-vault.js';\n` +
      `const vault = createMockSecureVault();\n`,
  );

  // No entrypoint at all: library-only package, nothing to enforce.
  mkdirSync(MOCK_NO_ENTRY, { recursive: true });
  writeFileSync(
    join(MOCK_NO_ENTRY, 'helpers.ts'),
    `export const registry = createMockCoreClientRegistry();\n`,
  );

  // --- fabricated-telemetry-check fixtures ---

  // Clean: stage list derived from the observed pipeline result.
  mkdirSync(TELEM_CLEAN, { recursive: true });
  writeFileSync(
    join(TELEM_CLEAN, 'fanout.ts'),
    `const result = await pipeline.run(plan);\n` +
      `const ctx = {\n` +
      `  layersExecuted: result.observedStages,\n` +
      `  timing: { completedAt: result.completedAt, durationMs: result.durationMs },\n` +
      `};\n` +
      `const empty = { layersExecuted: [] };\n` +
      `try {\n  await pipeline.run(plan);\n} catch {\n  status = 'failed';\n}\n`,
    );

  // Violation: the exact agentics-simulation-runner literal cited by ADR-011
  // Verification 3.
  mkdirSync(TELEM_LITERAL, { recursive: true });
  writeFileSync(
    join(TELEM_LITERAL, 'fanout.ts'),
    `const fanoutCtx: FanoutContext = {\n` +
      `  executionId: simulationId!,\n` +
      `  layersExecuted: ['validation', 'scheduling', 'dispatch'],\n` +
      `};\n` +
      `fireFanout(fanoutCtx);\n`,
  );

  // Violation: the ADR-011 Break 2 no-op execution block.
  mkdirSync(TELEM_EMPTY_TRY, { recursive: true });
  writeFileSync(
    join(TELEM_EMPTY_TRY, 'execute.ts'),
    `let status: 'running' | 'completed' | 'failed' = 'running';\n` +
      `try {\n` +
      `  // Fire-and-forget style: the gateway tracks the execution.\n` +
      `  // For now we do a lightweight "queue" by recording the intent.\n` +
      `  // Full engine-backed execution can be wired via gateway.submitPlanToEngine.\n` +
      `} catch {\n` +
      `  status = 'failed';\n` +
      `}\n`,
  );

  // Exempt: tier-1 meta simulation annotation (ADR-010 exemption).
  mkdirSync(TELEM_EXEMPT, { recursive: true });
  writeFileSync(
    join(TELEM_EXEMPT, 'sim.ts'),
    `// @tier1-meta-simulation\n` +
      `const ctx = { layersExecuted: ['validation', 'scheduling'] };\n`,
  );
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// mock-default-check — ADR-011 Decision 4 / Verification 2
// ---------------------------------------------------------------------------

describe('mock-default-check', () => {
  it('passes when the server builds its registry from environment configuration', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_CLEAN);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('fails on a mock instance used as a nullish default', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_NULLISH);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('mock-nullish-default');
    expect(result.stderr).toContain('listener.ts:4');
  });

  it('fails on a mock factory used as a nullish default', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_NULLISH);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('mock-factory-default');
    expect(result.stderr).toContain('listener.ts:3');
  });

  it('fails when a server entrypoint imports a mock module (ADR-011 Verification 2)', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_REGISTRY);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('mock-module-import');
    expect(result.stderr).toContain('server.ts:1');
    expect(result.stderr).toContain('mock-cores.js');
  });

  it('fails on a mock registry assigned in a server path', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_REGISTRY);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('mock-registry-assignment');
    expect(result.stderr).toContain('server.ts:3');
  });

  it('does NOT flag a mock factory reachable only from tests', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_TEST_ONLY);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
    expect(result.stderr).not.toContain('mock-vault');
  });

  it('passes when no server entrypoint exists', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_NO_ENTRY);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no server entrypoint');
  });

  it('reports ADR-011 guidance in error output', () => {
    const result = runHook('scripts/mock-default-check.ts', MOCK_REGISTRY);
    expect(result.stderr).toContain('ADR-011 Decision 4');
    expect(result.stderr).toContain('fail');
  });
});

// ---------------------------------------------------------------------------
// fabricated-telemetry-check — ADR-011 Decision 3 / Verification 3
// ---------------------------------------------------------------------------

describe('fabricated-telemetry-check', () => {
  it('passes when the stage list is derived from an observed pipeline result', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_CLEAN);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('fails on an array literal assigned to layersExecuted', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_LITERAL);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('hardcoded-stage-list');
    expect(result.stderr).toContain('fanout.ts:3');
    expect(result.stderr).toContain('layersExecuted');
  });

  it('fails on an empty try block (ADR-011 Break 2)', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_EMPTY_TRY);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty-execution-block');
    expect(result.stderr).toContain('execute.ts:2');
  });

  it('does not flag an empty array literal, which asserts nothing ran', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_CLEAN);
    expect(result.exitCode).toBe(0);
  });

  it('exempts @tier1-meta-simulation files', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_EXEMPT);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('exempts test files', () => {
    const dir = join(FIXTURE_DIR, 'telemetry-test-exempt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'fanout.test.ts'),
      `const ctx = { layersExecuted: ['validation', 'scheduling'] };\n`,
    );
    writeFileSync(join(dir, 'clean.ts'), `export function clean() { return 1; }\n`);

    const result = runHook('scripts/fabricated-telemetry-check.ts', dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('reports ADR-011 guidance in error output', () => {
    const result = runHook('scripts/fabricated-telemetry-check.ts', TELEM_LITERAL);
    expect(result.stderr).toContain('ADR-011 Decision 3');
    expect(result.stderr).toContain('fabrication is forbidden');
  });
});
