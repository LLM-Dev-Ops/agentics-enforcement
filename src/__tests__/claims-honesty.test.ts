import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Each assertion spawns a real hook process; the default 5s timeout is too tight.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const FIXTURE_DIR = join(process.cwd(), '.test-fixtures-adr013');

const R1_TYPED = join(FIXTURE_DIR, 'rule1-typed-badges');
const R1_PERMITTED = join(FIXTURE_DIR, 'rule1-permitted-badges');
const R2_UNCHECKED = join(FIXTURE_DIR, 'rule2-unchecked-gates');
const R2_ANNOTATED = join(FIXTURE_DIR, 'rule2-annotated-roadmap');
const R3_PAIRED = join(FIXTURE_DIR, 'rule3-placeholder-with-claim');
const R3_UNPAIRED = join(FIXTURE_DIR, 'rule3-placeholder-no-claim');
const R4_NO_LOCK = join(FIXTURE_DIR, 'rule4-no-lockfile');
const R4_LOCKED = join(FIXTURE_DIR, 'rule4-with-lockfile');
const EXEMPT_ALPHA = join(FIXTURE_DIR, 'exempt-prerelease');

function runHook(target: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    // Same invocation as the package.json `check:*` scripts.
    const stdout = execSync(`node --import tsx scripts/claims-honesty-check.ts ${target}`, {
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
  // --- Rule 1 -------------------------------------------------------------
  // Verbatim badge lines from the READMEs cited in ADR-013 Context:
  // connector-hub/README.md:3,5,6 and the original auto-optimizer coverage badge.
  mkdirSync(R1_TYPED, { recursive: true });
  writeFileSync(
    join(R1_TYPED, 'README.md'),
    `# LLM Connector Hub\n\n` +
      `[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/LLM-Dev-Ops/llm-connector-hub)\n` +
      `[![Test Coverage](https://img.shields.io/badge/coverage-96.3%25-brightgreen.svg)](https://github.com/LLM-Dev-Ops/llm-connector-hub)\n` +
      `[![Performance](https://img.shields.io/badge/throughput-46K%20ops%2Fs-success.svg)](./PERFORMANCE_RESULTS.md)\n` +
      `[![Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen.svg)](docs/TEST_COVERAGE_REPORT.md)\n`,
  );

  // Non-measured facts stay permitted: license, language, edition, toolchain
  // version. Plus the three sources ADR-013 Rule 1 explicitly allows.
  mkdirSync(R1_PERMITTED, { recursive: true });
  writeFileSync(
    join(R1_PERMITTED, 'README.md'),
    `# Permitted Badges\n\n` +
      `[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](./LICENSE)\n` +
      `[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)\n` +
      `[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)\n` +
      `[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)\n` +
      `[![SPARC](https://img.shields.io/badge/methodology-SPARC-blue.svg)](./plans/)\n` +
      `[![CI](https://github.com/LLM-Dev-Ops/schema-registry/actions/workflows/ci.yml/badge.svg)](https://github.com/LLM-Dev-Ops/schema-registry/actions/workflows/ci.yml)\n` +
      `[![Codecov](https://img.shields.io/codecov/c/github/LLM-Dev-Ops/schema-registry.svg)](https://codecov.io/gh/LLM-Dev-Ops/schema-registry)\n` +
      `[![Endpoint](https://img.shields.io/endpoint?url=https://example.com/badge.json)](https://example.com)\n`,
  );

  // --- Rule 2 -------------------------------------------------------------
  // governance-dashboard/docs/COMPLETION_ROADMAP.md:1284-1287 gate block.
  const roadmapBody =
    `# Completion Roadmap\n\n` +
    `- MVP Phase: 8-10 weeks\n` +
    `- Beta Phase: 6-8 weeks\n` +
    `- v1.0 Release: 4-6 weeks\n\n` +
    `## Phase 3: v1.0 Production Release (Weeks 19-24)\n\n` +
    `**Production Gate (End of Week 24):**\n` +
    `- [ ] All v1.0 features complete\n` +
    `- [ ] 95%+ test coverage maintained\n` +
    `- [ ] Zero critical or high bugs\n`;

  mkdirSync(join(R2_UNCHECKED, 'docs'), { recursive: true });
  writeFileSync(
    join(R2_UNCHECKED, 'README.md'),
    `# LLM Governance Dashboard\n\n` +
      `> Production-ready, open source platform for multi-tenant LLM governance.\n`,
  );
  writeFileSync(join(R2_UNCHECKED, 'docs', 'COMPLETION_ROADMAP.md'), roadmapBody);

  // Identical repo, roadmap annotated as forward-looking — the ADR-013 exemption.
  mkdirSync(join(R2_ANNOTATED, 'docs'), { recursive: true });
  writeFileSync(
    join(R2_ANNOTATED, 'README.md'),
    `# LLM Governance Dashboard\n\n` +
      `> Production-ready, open source platform for multi-tenant LLM governance.\n`,
  );
  writeFileSync(
    join(R2_ANNOTATED, 'docs', 'COMPLETION_ROADMAP.md'),
    `<!-- @post-1.0-roadmap -->\n${roadmapBody}`,
  );

  // --- Rule 3 -------------------------------------------------------------
  // connector-hub/README.md:5 + :11 — placeholder org paired with the claim.
  mkdirSync(R3_PAIRED, { recursive: true });
  writeFileSync(
    join(R3_PAIRED, 'README.md'),
    `# LLM Connector Hub\n\n` +
      `[![Docs](https://img.shields.io/badge/docs-complete-blue.svg)](https://github.com/your-org/llm-connector-hub)\n\n` +
      `> **Status**: ✅ **Production-Ready** | **Version**: 0.1.0\n`,
  );

  // research-core shape: placeholders, but no production claim. Must NOT flag.
  mkdirSync(R3_UNPAIRED, { recursive: true });
  writeFileSync(
    join(R3_UNPAIRED, 'README.md'),
    `# Research Core\n\n` +
      `An experiment tracker.\n\n` +
      `\`\`\`bash\ngit clone https://github.com/yourusername/research-core\n\`\`\`\n`,
  );

  // --- Rule 4 -------------------------------------------------------------
  mkdirSync(R4_NO_LOCK, { recursive: true });
  writeFileSync(
    join(R4_NO_LOCK, 'README.md'),
    `# Auto Optimizer\n\n` +
      `[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](./ci)\n\n` +
      `Cargo workspace with 10 crates, 8 tests passing, zero compilation errors.\n`,
  );
  writeFileSync(join(R4_NO_LOCK, 'Cargo.toml'), `[workspace]\nmembers = ["crates/core"]\n`);

  // Prose build claim only — a typed `build-passing` badge would also (correctly)
  // trip Rule 1, which would confound this Rule 4 assertion.
  mkdirSync(R4_LOCKED, { recursive: true });
  writeFileSync(
    join(R4_LOCKED, 'README.md'),
    `# Locked Workspace\n\n` + `Builds with zero compilation errors.\n`,
  );
  writeFileSync(join(R4_LOCKED, 'Cargo.toml'), `[workspace]\nmembers = ["crates/core"]\n`);
  writeFileSync(join(R4_LOCKED, 'Cargo.lock'), `version = 3\n\n[[package]]\nname = "core"\n`);

  // --- Exemption ----------------------------------------------------------
  // A repo that says it is alpha is not making the claim the rules police.
  mkdirSync(EXEMPT_ALPHA, { recursive: true });
  writeFileSync(
    join(EXEMPT_ALPHA, 'README.md'),
    `# Experimental Thing\n\n` +
      `[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](./plans/)\n` +
      `[![Coverage](https://img.shields.io/badge/coverage-99%25-brightgreen.svg)](./cov)\n\n` +
      `> **Status: Alpha.** Production-ready is not claimed.\n` +
      `Clone from https://github.com/your-org/thing\n`,
  );
  writeFileSync(join(EXEMPT_ALPHA, 'Cargo.toml'), `[workspace]\n`);
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Rule 1 — quantitative badges must be generated, not typed
// ---------------------------------------------------------------------------

describe('claims-honesty-check / Rule 1', () => {
  it('flags a hardcoded coverage badge', () => {
    const result = runHook(R1_TYPED);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('rule1-badge-not-generated');
    expect(result.stderr).toContain('README.md:4');
    expect(result.stderr).toContain('96.3%');
  });

  it('flags a hardcoded build-passing badge', () => {
    const result = runHook(R1_TYPED);
    expect(result.stderr).toContain('README.md:3');
    expect(result.stderr).toContain('"build" badge asserting "passing"');
  });

  it('flags a hardcoded throughput badge and decodes its value', () => {
    const result = runHook(R1_TYPED);
    expect(result.stderr).toContain('README.md:5');
    expect(result.stderr).toContain('46K ops/s');
  });

  it('does not over-match license, language or toolchain badges', () => {
    const result = runHook(R1_PERMITTED);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });

  it('permits native workflow, codecov and endpoint badges', () => {
    const result = runHook(R1_PERMITTED);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('rule1');
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — production claim vs roadmap
// ---------------------------------------------------------------------------

describe('claims-honesty-check / Rule 2', () => {
  it('flags a production claim against unchecked release gates', () => {
    const result = runHook(R2_UNCHECKED);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('rule2-claim-contradicts-roadmap');
    expect(result.stderr).toContain('All v1.0 features complete');
  });

  it('reports the README claim line, not the roadmap line', () => {
    const result = runHook(R2_UNCHECKED);
    expect(result.stderr).toContain('README.md:3');
    expect(result.stderr).toContain('COMPLETION_ROADMAP.md:10');
  });

  it('passes once the roadmap is annotated @post-1.0-roadmap', () => {
    const result = runHook(R2_ANNOTATED);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — placeholder org URLs
// ---------------------------------------------------------------------------

describe('claims-honesty-check / Rule 3', () => {
  it('flags a placeholder org URL paired with a production claim', () => {
    const result = runHook(R3_PAIRED);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('rule3-placeholder-with-production-claim');
    expect(result.stderr).toContain('README.md:3');
  });

  it('does NOT flag placeholders in a README making no production claim', () => {
    const result = runHook(R3_UNPAIRED);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — build claim requires a reproducible build
// ---------------------------------------------------------------------------

describe('claims-honesty-check / Rule 4', () => {
  it('flags a build claim when the Cargo workspace has no Cargo.lock', () => {
    const result = runHook(R4_NO_LOCK);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('rule4-build-claim-without-lockfile');
    expect(result.stderr).toContain('Cargo.lock');
  });

  it('passes when the lockfile is committed', () => {
    const result = runHook(R4_LOCKED);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PASS');
  });
});

// ---------------------------------------------------------------------------
// Exemptions
// ---------------------------------------------------------------------------

describe('claims-honesty-check / exemptions', () => {
  it('skips a repo that declares itself pre-release', () => {
    const result = runHook(EXEMPT_ALPHA);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1 skipped as pre-release');
  });
});
