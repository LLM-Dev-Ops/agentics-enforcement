import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_DIR = join(process.cwd(), '.test-fixtures', 'dependency-name-resolution');
const SCRIPT = 'scripts/dependency-name-resolution-check.ts';

/** Every case shells out to `npx tsx`, which alone can take several seconds cold. */
const LOCAL_TIMEOUT_MS = 60_000;
/** Network-backed cases pin refs that are stable, but registries are still remote. */
const NETWORK_TIMEOUT_MS = 180_000;

function fixture(name: string, files: Record<string, string>): string {
  const dir = join(FIXTURE_DIR, name);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

beforeAll(() => {
  // Path source: workspace member whose [package] name does not match the dep key.
  fixture('cargo-path-mismatch', {
    'Cargo.toml': '[package]\nname = "consumer"\nversion = "0.1.0"\n\n[dependencies]\nllm-shield-core = { path = "crates/shield" }\n',
    'crates/shield/Cargo.toml': '[package]\nname = "shield-core"\nversion = "0.1.0"\n',
  });

  // Same shape, but with the `package = ` alias that makes the rename legitimate.
  fixture('cargo-path-alias', {
    'Cargo.toml': '[package]\nname = "consumer"\nversion = "0.1.0"\n\n[dependencies]\nllm-shield-core = { path = "crates/shield", package = "shield-core" }\n',
    'crates/shield/Cargo.toml': '[package]\nname = "shield-core"\nversion = "0.1.0"\n',
  });

  // research-lab's dormant case: `workspace = true` for a key the root never declares.
  fixture('cargo-workspace-undeclared', {
    'Cargo.toml': '[workspace]\nmembers = ["api"]\n\n[workspace.dependencies]\ninfra-config = { git = "https://github.com/LLM-Dev-Ops/infra", branch = "main" }\n',
    'api/Cargo.toml': '[package]\nname = "llm-research-api"\nversion = "0.1.0"\n\n[dependencies]\ninfra-config.workspace = true\ninfra-core.workspace = true\n',
  });

  // incident-manager's documented block: comments are not declarations.
  fixture('cargo-commented-out', {
    'Cargo.toml': [
      '[package]',
      'name = "incident-manager"',
      'version = "0.1.0"',
      '',
      '[dependencies]',
      '# llm-sentinel-core = { git = "https://github.com/LLM-Dev-Ops/sentinel", tag = "v0.1.0" }',
      '# llm-fabricated-crate = "9.9.9"',
      'serde = { version = "1.0", features = ["derive"] }',
      '',
    ].join('\n'),
  });

  // Third-party names are out of scope even when they would not resolve.
  fixture('cargo-third-party', {
    'Cargo.toml': '[workspace]\nmembers = ["api"]\n\n[workspace.dependencies]\nserde = "1.0"\n',
    'api/Cargo.toml': '[package]\nname = "api"\nversion = "0.1.0"\n\n[dependencies]\nsqlx.workspace = true\nonce_cell.workspace = true\n',
  });

  // auto-optimizer's `llm-shield-core = "0.2"` against a crate published only at 0.1.0.
  fixture('cargo-registry-unsatisfiable', {
    'Cargo.toml': '[package]\nname = "auto-optimizer"\nversion = "0.1.0"\n\n[dependencies]\nllm-shield-core = "0.2"\n',
  });

  // Same declaration under the deliberately-unpublished escape hatch.
  fixture('cargo-registry-exempt', {
    'Cargo.toml': '[package]\nname = "auto-optimizer"\nversion = "0.1.0"\n\n[package.metadata.agentics]\nunpublished = true\n\n[dependencies]\nllm-shield-core = "0.2"\n',
  });

  // analytics-hub's git URL pointing at a repo that does not exist.
  fixture('cargo-git-missing-repo', {
    'Cargo.toml': '[package]\nname = "analytics-hub"\nversion = "0.1.0"\n\n[dependencies]\nllm-infra-core = { git = "https://github.com/LLM-Dev-Ops/llm-infra", branch = "main" }\n',
  });

  // incident-manager's tag-vs-main rename: sentinel v0.1.0 publishes `sentinel-core`.
  fixture('cargo-git-renamed-at-tag', {
    'Cargo.toml': '[package]\nname = "incident-manager"\nversion = "0.1.0"\n\n[dependencies]\nllm-sentinel-core = { git = "https://github.com/LLM-Dev-Ops/sentinel", tag = "v0.1.0" }\n',
  });

  // The same pin with the name the tag actually carries.
  fixture('cargo-git-correct-at-tag', {
    'Cargo.toml': '[package]\nname = "incident-manager"\nversion = "0.1.0"\n\n[dependencies]\nsentinel-core = { git = "https://github.com/LLM-Dev-Ops/sentinel", tag = "v0.1.0" }\n',
  });

  // governance-dashboard's github: specifier against a repo whose root manifest is unnamed.
  fixture('npm-github-mismatch', {
    'package.json': JSON.stringify(
      { name: 'governance-dashboard', dependencies: { '@llm-dev-ops/infra': 'github:LLM-Dev-Ops/infra' } },
      null,
      2,
    ),
  });

  // auto-optimizer's unsatisfiable published ranges.
  fixture('npm-range-unsatisfiable', {
    'package.json': JSON.stringify(
      { name: 'auto-optimizer', dependencies: { '@llm-dev-ops/llm-config-core': '^0.1.0' } },
      null,
      2,
    ),
  });
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function runCheck(dir: string, flags = ''): { output: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx ${SCRIPT} ${dir} ${flags}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { output: stdout, exitCode: 0 };
  } catch (err: any) {
    return {
      output: `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`,
      exitCode: err.status ?? 1,
    };
  }
}

describe('dependency-name-resolution-check — offline rules', () => {
  it('blocks a path dependency whose target declares a different package name', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-path-mismatch'), '--offline');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('[cargo-path]');
    expect(result.output).toContain('name = "shield-core"');
  }, LOCAL_TIMEOUT_MS);

  it('accepts a renamed path dependency carrying a package alias', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-path-alias'), '--offline');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('PASS');
  }, LOCAL_TIMEOUT_MS);

  it('blocks `workspace = true` for a key absent from [workspace.dependencies]', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-workspace-undeclared'), '--offline');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('infra-core');
    expect(result.output).not.toContain('— infra-config');
  }, LOCAL_TIMEOUT_MS);

  it('ignores commented-out dependency blocks', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-commented-out'), '--offline');
    expect(result.exitCode).toBe(0);
  }, LOCAL_TIMEOUT_MS);

  it('ignores third-party dependency names', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-third-party'), '--offline');
    expect(result.exitCode).toBe(0);
  }, LOCAL_TIMEOUT_MS);

  it('skips network rules in offline mode rather than failing them', () => {
    const result = runCheck(join(FIXTURE_DIR, 'cargo-git-missing-repo'), '--offline');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('network rule(s) skipped');
  }, LOCAL_TIMEOUT_MS);
});

describe('dependency-name-resolution-check — resolved against real sources', () => {
  it(
    'blocks a crates.io requirement no published version satisfies',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'cargo-registry-unsatisfiable'));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('[cargo-registry]');
      expect(result.output).toContain('llm-shield-core');
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'downgrades a registry failure to a warning under the unpublished escape hatch',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'cargo-registry-exempt'));
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('warning(s)');
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'blocks a git source pointing at a repository that does not exist',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'cargo-git-missing-repo'));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('LLM-Dev-Ops/llm-infra');
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'blocks a crate name that exists on main but not at the pinned tag',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'cargo-git-renamed-at-tag'));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('llm-sentinel-core');
      expect(result.output).toContain('sentinel-core');
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'accepts the name the pinned tag actually carries',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'cargo-git-correct-at-tag'));
      expect(result.exitCode).toBe(0);
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'blocks a github: specifier whose target root manifest carries a different name',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'npm-github-mismatch'));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('[npm-github]');
      expect(result.output).toContain('#path:/sdk/ts');
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    'blocks an npm range no published version satisfies',
    () => {
      const result = runCheck(join(FIXTURE_DIR, 'npm-range-unsatisfiable'));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('[npm-range]');
      expect(result.output).toContain('0.5.0');
    },
    NETWORK_TIMEOUT_MS,
  );
});
