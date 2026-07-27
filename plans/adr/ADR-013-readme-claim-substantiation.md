# ADR-013: README Claim Substantiation

**Status:** Proposed
**Date:** 2026-07-27
**Deciders:** Agentics Platform Team
**Scope:** Fleet-wide README and status-badge content
**SPARC Phase:** Cross-cutting (Completion / Refinement)

---

## Context

A fleet-wide survey found that documentation volume and README status claims run
*opposite* to demonstrable functionality: the repos making the loudest "Production
Ready" claims are frequently the ones with the least evidence behind them. This was
re-verified against primary sources on 2026-07-27. Every citation below was read
directly from the working tree.

### Finding 1 — Claims contradict each other inside a single README

`schema-registry/README.md` carries five green badges including
`status-production_ready-brightgreen` (line 7) and `build-passing-brightgreen`
(line 9). Neither is generated; both are hardcoded `img.shields.io/badge/` URLs.

The status block immediately below contradicts itself:

- Line 16: `**Documentation:** 500KB+ across 30+ comprehensive documents`
- Line 17: `**Implementation:** Cargo workspace with 10 crates, 8 tests passing, zero compilation errors`
- Line 20: `**Testing:** 550+ tests planned, integration tests operational, >85% coverage target`

Then, 234 lines later in the same file:

- Line 251: `The project successfully compiles with all 13 crates and comprehensive test infrastructure:`
- Line 254: `- ✅ 550+ tests implemented (Unit, Integration, E2E, Property)`
- Line 265: `- **schema-registry-core** - Core types, traits, state machine (15 tests passing)`

So one README states 550+ tests *planned* (line 20) and 550+ tests *implemented*
(line 254); states 8 tests passing (line 17) and 15 tests passing in a single crate
(line 265); and states 10 crates (line 17) and 13 crates (line 251) while
`schema-registry/Cargo.toml` lines 2-19 declare 17 workspace members against 19
directories in `crates/`. Measured ground truth: 656 `#[test]`/`#[tokio::test]`
attributes across 56,574 lines of Rust, and **no `Cargo.lock` exists anywhere in
the repo**, so no build is reproducible and the `build-passing` badge is
unverifiable by construction. The repo also ships
`plans/SPARC-COMPLETION-CERTIFICATE.md`, linked from line 29 as the
"🏆 **Final deliverables summary**" for "**Executives, stakeholders**".

The point is not which number is right. It is that **no number in that README is
derived from an executed run**, so they were free to drift apart from each other.

### Finding 2 — "Production ready" claimed while the roadmap describes the work as future

`governance-dashboard/README.md` line 5 badges `version-1.0.0`, line 7 badges
`build-passing-brightgreen`, and line 10 opens: `> Production-ready, open source
platform for multi-tenant LLM governance...`.

`governance-dashboard/docs/COMPLETION_ROADMAP.md` describes that same v1.0 as
unstarted future work:

- Line 8-11: `- MVP Phase: 8-10 weeks` / `- Beta Phase: 6-8 weeks` / `- v1.0 Release: 4-6 weeks` / `- **Total Estimated Duration: 18-24 weeks**`
- Line 769: `## Phase 3: v1.0 Production Release (Weeks 19-24)`
- Line 1284-1287: `**Production Gate (End of Week 24):**` followed by `- [ ] All v1.0 features complete`, `- [ ] 95%+ test coverage maintained`, `- [ ] Zero critical or high bugs`

Every checkbox in all three phase gates (lines 1260-1294) is unchecked. Measured
ground truth: 251 TODO/FIXME markers across the repo, 49 of them in
`services/auth-service` alone — the highest concentration found fleet-wide.

### Finding 3 — Uniform "Complete" table with an unbuildable dependency graph

`auto-optimizer/README.md` line 9 badges `status-production--ready-brightgreen` and
line 11 badges `coverage-88%25-brightgreen`, linking to
`docs/TEST_COVERAGE_REPORT.md` (a checked-in markdown file, not a coverage run).
Lines 48-60 are a 13-row feature table in which **all 13 rows** end in
`| ✅ Complete |` — Feedback Collection, Stream Processing, Distributed State,
Analyzer Engine, Decision Engine, Canary Deployments, Storage Layer, REST API,
gRPC API, Integrations, CLI Tool, Main Service Binary, Deployment.

Meanwhile `auto-optimizer/Cargo.toml` lines 38-44 declare six upstream
dependencies as bare registry versions with no `path` and no `git` source:

```toml
# LLM-Dev-Ops upstream dependencies (Phase 2B compile-time)
llm-cost-ops = "0.1"
llm-latency-lens = "0.1"
sentinel = "0.1"
llm-shield-core = "0.2"
llm-observatory-core = "0.1"
llm-config-manager = "0.1"
```

There is **no `Cargo.lock` anywhere in the repo**, so these have never been
resolved. The sibling repo `benchmark-exchange` reached the opposite conclusion
about the same crate independently: `benchmark-exchange/Cargo.toml` line 97 pins
it to a git source precisely because the registry version is not obtainable —

```toml
llm-observatory-core = { git = "https://github.com/LLM-Dev-Ops/observatory", version = "0.1.1" }
```

A workspace that cannot resolve its dependency graph cannot have produced the 88%
coverage number on the badge, nor 13 rows of "Complete".

### Finding 4 — The pattern is fleet-wide, not three cherry-picked repos

Scanning every top-level repo README for placeholder org URLs (`your-org`,
`yourusername`, `your-username`, `yourorg`) returns **13 repos**, of which **8
simultaneously claim production readiness**:

| Repo | Placeholder hits | "production ready" mentions |
|---|---|---|
| connector-hub | 6 | 6 |
| governance-dashboard | 7 | 4 |
| edge-agent | 5 | 3 |
| inference-gateway | 4 | 1 |
| auto-optimizer | 1 | 3 |
| policy-engine | 1 | 3 |
| schema-registry | 1 | 7 |
| registry | 1 | 1 |
| research-core | 4 | 0 |
| research-lab | 3 | 0 |
| agentics-deployment-exporters | 1 | 0 |
| copilot-agent | 2 | 1 |
| enterprise-roi-engine | 1 | 0 |

`connector-hub/README.md` is the clearest single specimen: line 5 is
`[![Test Coverage](https://img.shields.io/badge/coverage-96.3%25-brightgreen.svg)](https://github.com/your-org/llm-connector-hub)`
— a hand-typed coverage figure whose "evidence" link points at a repository URL
that does not exist. Line 11 then asserts
`> **Status**: ✅ **Production-Ready** | **Version**: 0.1.0 | **Test Coverage**: 96.3%`,
and line 23 repeats `- 🛡️ **Production-Ready**: 96.3% test coverage, zero
compilation errors`. Similarly `edge-agent/README.md` line 9 is
`![Production Ready](https://img.shields.io/badge/production-ready-brightgreen.svg)`
while lines 610-619 route users to `github.com/yourusername/llm-edge-agent`.

### Root cause

Every failing claim shares one mechanism: **the number and the thing it describes
are stored in different files, and nothing checks that they agree.** A hardcoded
`img.shields.io/badge/coverage-88%25` string is a literal, not a measurement. It
cannot go stale because it was never fresh. This is precisely the class of
divergence ADR-010 already addresses for schemas, cost arithmetic, and contract
imports — the fleet simply never extended it to reader-facing claims.

## Decision

**A reader-facing status claim is an assertion about the repository and is subject
to CI enforcement exactly like the invariants in ADR-010.** Four rules apply
fleet-wide.

### Rule 1 — Quantitative badges must be generated, not typed

Any README badge asserting a measured quantity — coverage %, test count, RPS,
latency, uptime, build status — must be emitted by a CI job that computes it in
that same pipeline run. Hardcoded `img.shields.io/badge/<metric>-<value>` URLs for
these metrics are **prohibited**.

Permitted sources: a CI-updated gist/endpoint badge, a coverage-service badge
(Codecov/Coveralls), or a native `github.com/<org>/<repo>/actions/workflows/<wf>/badge.svg`
workflow badge.

Static `img.shields.io/badge/` URLs remain permitted for **non-measured** facts:
license, language, edition, minimum toolchain version.

### Rule 2 — "Production ready" may not coexist with a roadmap that says otherwise

A repo may not assert "production ready", "v1.0", or equivalent in its README while
any in-repo roadmap, completion, or gate document describes core features as future
work or carries unchecked release-gate checkboxes. The repo must either check the
gates or drop the claim. Documents describing *post-1.0* enhancements are exempt;
documents whose gates govern the *currently claimed* version are not.

### Rule 3 — Placeholder org URLs block a production-ready claim

A README containing `your-org`, `yourusername`, `your-username`, or `yourorg` may
not simultaneously claim production readiness. A project whose clone command does
not work has not shipped.

### Rule 4 — A build-status claim requires a reproducible build

A repo asserting `build-passing` or "zero compilation errors" must have a committed
lockfile for its primary toolchain (`Cargo.lock` for Rust binaries/workspaces,
`package-lock.json` for Node) and a CI job that builds from it.

### Enforcement

A sixth CI hook joins the ADR-010 registry, following the established
`scripts/*-check.ts` pattern (`schema-duplication-check.ts`,
`contract-import-check.ts`) — scan, collect violations, report `file:line`, exit
0 or 1:

| Hook | Target Repos | Trigger | Action | Severity |
|---|---|---|---|---|
| `claims-honesty-check` | All repos with a README | PR / push | Reject if a README status claim is unbacked per Rules 1-4 | **Block** |

Severity is phased (see Implementation Plan): **Warn** during remediation, **Block**
from 2026-10-01.

### Exemptions

| Exemption | Scope | Mechanism |
|---|---|---|
| Pre-release repos | All rules | README states `Status: Experimental`/`Alpha`/`WIP`; hook skips |
| Aspirational docs | Rule 2 | Roadmap file annotated `<!-- @post-1.0-roadmap -->` |
| Vendored READMEs | All rules | Glob exclusion `**/node_modules/**`, `**/vendor/**`, `**/target/**` |

## Consequences

### Positive

- A green badge becomes evidence again. Today it is decoration.
- Removes the reader's burden of cross-checking a README against `Cargo.toml`,
  a roadmap, and a test run to learn whether a repo works.
- The failure mode inverts usefully: an ungenerated badge fails CI, so the cheap
  path becomes deleting the claim rather than inflating it.
- Catches the specific divergence class no existing hook covers — ADR-010's five
  hooks all check code against code; none check prose against reality.

### Negative

- Many READMEs across the fleet will fail on day one. Mitigation: phased Warn
  period, and deleting a badge is always a valid fix.
- Wiring real coverage reporting is per-repo work with no shared solution.
  Mitigation: Rule 1 permits *removing* the badge; only repos that want the number
  must earn it.
- Rule 2 requires reading prose, which is fuzzier than the AST-shaped checks in
  ADR-010. Mitigation: match a fixed claim vocabulary and a fixed set of roadmap
  filenames; ambiguity resolves toward pass.

### Risks

- Authors could evade by rewording ("battle-tested", "enterprise-grade") rather
  than substantiating. Mitigation: the hook targets quantitative badges and the
  explicit claim vocabulary; code review remains complementary, as in ADR-010.
- Blocking on prose could stall unrelated PRs. Mitigation: violations are
  README-scoped and fixable in the same PR by deletion.
- Over-broad Rule 2 matching could flag legitimate forward-looking roadmaps.
  Mitigation: the `@post-1.0-roadmap` annotation, and gate-checkbox state as the
  primary signal rather than the mere presence of week estimates.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Manual README review at release | Does not scale to ~55 repos; this is exactly how the current state arose. |
| Ban status badges entirely | Throws away real signal. A CI-generated coverage badge is genuinely useful. |
| Warn-only, permanently | Warnings are already effectively what code review provided. The survey shows it did not hold. |
| Fix the three worst repos only | Fleet sweep found 13 repos with placeholder URLs; the pattern is systemic, not local. |
| Lint rule (markdownlint plugin) | Rules 2 and 4 require cross-file reasoning (README vs roadmap vs lockfile) that a line-oriented linter cannot express. |

## Implementation Plan

1. Author `agentics-enforcement/scripts/claims-honesty-check.ts`, matching the
   structure of `scripts/schema-duplication-check.ts`: accept a target dir,
   default to repo root, report violations as `file:line — <rule> <message>`,
   exit 0/1.
2. Implement Rule 1: flag `img.shields.io/badge/` URLs whose metric segment
   matches `coverage|tests?|rps|latency|uptime|build|passing` and whose value
   segment is a literal number, percentage, or `passing`.
3. Implement Rule 3 (cheapest, zero false positives): flag a README containing
   both a placeholder-org token and a production-readiness token.
4. Implement Rule 4: if a README asserts `build-passing` or "zero compilation
   errors", require a lockfile matching the repo's manifest type.
5. Implement Rule 2: for repos claiming production readiness, scan
   `**/COMPLETION_ROADMAP.md`, `**/ROADMAP.md`, `**/*COMPLETION*.md` for unchecked
   `- [ ]` items under a heading matching `/gate|release|v1\.0|production/i`,
   honoring the `@post-1.0-roadmap` annotation.
6. Register `check:claims-honesty` in `agentics-enforcement/package.json` scripts
   alongside `check:schema-duplication` and `check:contract-imports`.
7. Add unit tests under `src/__tests__/` covering each rule, using the exact
   README excerpts cited in Context as fixtures — including the negative cases
   (a license badge must pass Rule 1; a `@post-1.0-roadmap` file must pass Rule 2).
8. Add the hook to the ADR-010 hook registry table, severity **Warn**.
9. Land companion ADRs and remediation in the three worst offenders:
   `schema-registry` (ADR-0001), `governance-dashboard` (ADR-0001),
   `auto-optimizer` (ADR-0001).
10. Sweep the remaining 10 placeholder-URL repos from the Finding 4 table.
11. Flip severity to **Block** on 2026-10-01.

## Verification

- [ ] `npm run check:claims-honesty` exits 1 against each of the three cited
      READMEs at their current commit, naming the specific line for each rule
      (`schema-registry/README.md:7`, `governance-dashboard/README.md:10`,
      `auto-optimizer/README.md:11`).
- [ ] The same command exits 0 against a README carrying only license/language
      badges, confirming Rule 1 does not over-match.
- [ ] Rule 3 flags exactly the 8 repos in the Finding 4 table that pair
      placeholders with production-ready claims, and does not flag the 5 that
      carry placeholders without such a claim.
- [ ] Rule 2 flags `governance-dashboard` on the unchecked gates at
      `docs/COMPLETION_ROADMAP.md:1284-1294`, and passes once the file is
      annotated `@post-1.0-roadmap` — confirming the exemption works.
- [ ] Rule 4 flags `auto-optimizer` and `schema-registry` for asserting build
      success with no `Cargo.lock`, and passes for `governance-dashboard`, which
      has one.
- [ ] Unit tests in `src/__tests__/` pass under `npm test`.
- [ ] After remediation, all three companion-ADR repos exit 0.
- [ ] Re-running the Finding 4 fleet sweep on 2026-10-01 returns zero repos
      pairing placeholder URLs with production-ready claims.
