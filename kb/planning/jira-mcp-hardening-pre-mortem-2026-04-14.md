---
title: "Pre-Mortem: jira-mcp Hardening & Market Readiness"
category: planning
service: jira-mcp
status: planned
created: "2026-04-14"
last_updated: "2026-04-14"
related_plan: "kb/planning/jira-mcp-hardening-plan-2026-04-14.md"
---

# Pre-Mortem: `jira-mcp` Hardening & Market Readiness

Assumption: the hardening initiative failed badly. Below is what could have gone wrong, what the early warnings would have been, and how to prevent it. Required by the planning SOP. [PATH: kb/procedures/plan-implementation-sop.md]

## 1. Failure Scenarios

### Scenario 1 — Release still publishes a broken package
- **What failed:** a tag pushed a version with an incomplete set of quality gates.
- **Why:** `publish.yml` still did not reflect `sop-release.md`.
- **Early warnings:** the workflow still ran only the build step, with no `validate_counts.py` and no smoke step.
- **Prevention:** enforce `typecheck`, `lint`, `test`, `build`, `validate_counts.py`, and `npm pack --dry-run` before publish.

### Scenario 2 — SDK/Vitest upgrade breaks the repository
- **What failed:** after dependency upgrades, tests or build behavior changed unexpectedly.
- **Why:** the upgrade happened without boundary tests.
- **Early warnings:** new type/ESM warnings, MCP SDK API changes, flaky tests.
- **Prevention:** write boundary tests on the current version first, verify they pass, then upgrade dependencies, then verify the same tests still pass. This sequence ensures regressions are caught by tests that were proven green before the upgrade.

### Scenario 3 — Retry/backoff complicates the code without real value
- **What failed:** the connector became more complex while edge cases still remained uncovered.
- **Why:** resilience scope was too broad.
- **Early warnings:** helper sprawl, hard-to-read retry conditions, lack of deterministic tests.
- **Prevention:** limit retry to `429` and selected `5xx` responses with explicit limits and tests.

### Scenario 4 — Documentation drifts again
- **What failed:** README/SOP/SECURITY once again stopped describing the real repository.
- **Why:** there was no automated enforcement and no single source of truth discipline.
- **Early warnings:** README counts diverged from source, and security claims were not backed by code.
- **Prevention:** enforce `validate_counts.py` in CI and use a docs-parity review checklist.

### Scenario 5 — Coverage improves on paper, not in reality
- **What failed:** coverage remained high, but the most important risks still had no tests.
- **Why:** easy helper tests were added instead of boundary tests.
- **Early warnings:** `src/server.ts` and `src/connector/jira-connector.ts` still lacked strong tests.
- **Prevention:** keep explicit acceptance criteria for boundary coverage.

## 2. Contributing Factors

### Technical
- centralized logic and dispatch inside `src/server.ts`,
- no resilience policy in `src/connector/jira-connector.ts`,
- current coverage exclusions weaken the quality signal.

### Process
- the release SOP and actual workflow are not synchronized,
- there is no mandatory runtime smoke test before publish,
- there is no clear owner for docs parity.

### People
- the temptation to say “the repo already looks good, let’s move on to features”,
- overconfidence caused by 413 tests,
- a tendency to postpone hardening because it does not create immediate feature value.

### External
- changes in `@modelcontextprotocol/sdk`,
- Jira Cloud instability or rate limits,
- changes in Node/npm/GitHub Actions.

## 3. Preventable vs Unpredictable

| Failure | Prevention | Cost | Impact if Prevented |
|---|---|---:|---|
| publish without gates | workflow update | low | very high |
| regression after upgrade | boundary tests | medium | high |
| docs drift | `validate_counts` in CI | low | medium |
| retry overengineering | minimal-scope ADR | low | medium |
| real upstream API change | monitoring + contract tests | medium | medium/high |

## 4. Critical Decisions

1. **Do we upgrade dependencies before or after boundary tests?**
   - better: write boundary tests first on current version, then upgrade, then verify tests still pass. Not as a standalone change without tests.

2. **Is retry/backoff P1 or P2?**
   - better: P1, but in a minimal scope.

3. **Is a `server.ts` refactor mandatory?**
   - better: no, only after tests and gates are in place.

## 5. Prevention Strategies

### MUST DO
- [ ] Bring `publish.yml` up to the release SOP standard.
- [ ] Close the testing gaps in `server.ts`, CLI bootstrap, and `JiraConnector`.
- [ ] Refresh sensitive dependencies.
- [x] Align docs parity and count validation. (done 2026-04-14: validate_counts.py, README fix, secondary docs cleanup)
- [x] Resolve security audit findings. (done 2026-04-14: cache 0o600, CWD warning, error truncation)

### SHOULD DO
- [ ] Add a Node 18/20/22 matrix.
- [ ] Introduce minimal retry/backoff.
- [ ] Write a follow-up backlog for P2 / enterprise readiness.

### COULD DO
- [ ] Split `src/server.ts` into registry + dispatch + schema mapping.
- [ ] Extend smoke tests with an automated stdio contract check.

## 6. Monitoring & Early Detection

| Warning Sign | Indicates | Action |
|---|---|---|
| publish workflow without `lint/test` | release risk | block merge/tag |
| CVE scan shows high risk again | dependency drift | schedule refresh |
| coverage exclusions come back | paper quality | reject PR |
| README count mismatch | trust drift | fail CI |
| flaky connector tests | weak boundary confidence | stop refactor until stabilized |

## 7. Stop Conditions

If any of the following happens during execution, stop the scope and return to approval:
- the SDK upgrade requires a breaking API rewrite,
- retry/backoff requires a much larger connector redesign,
- the publish flow cannot be safely aligned in one step,
- boundary tests expose a larger architectural problem than expected.

