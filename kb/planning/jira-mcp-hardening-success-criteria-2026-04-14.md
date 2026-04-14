---
title: "Success Criteria: jira-mcp Hardening & Market Readiness"
category: planning
service: jira-mcp
status: planned
created: "2026-04-14"
last_updated: "2026-04-14"
related_plan: "kb/planning/jira-mcp-hardening-plan-2026-04-14.md"
---

# Success Criteria: `jira-mcp` Hardening & Market Readiness

This plan and validation checklist follow the SOP requirement for deliverables, verification methods, quality standards, and acceptance criteria. [PATH: kb/procedures/plan-implementation-sop.md] [PATH: kb/procedures/success-criteria-validation.md]

## 1. Deliverables (WHAT)

- [ ] **D1: Hardened publish pipeline**
  - Format: workflow YAML
  - Location: `.github/workflows/publish.yml`

- [ ] **D2: Boundary test suite**
  - Format: test files
  - Location: `tests/server/`, `tests/cli/`, `tests/connector/`

- [ ] **D3: Updated coverage policy**
  - Format: config update
  - Location: `vitest.config.ts`

- [ ] **D4: Jira connector resilience improvements**
  - Format: TypeScript source + tests
  - Location: `src/connector/jira-connector.ts`, `tests/connector/*`

- [ ] **D5: Docs parity fixes**
  - Format: markdown docs
  - Location: `README.md`, `SECURITY.md`, `kb/reference/architecture.md`, `.github/CONTRIBUTING.md`

- [x] **D6: Count validation enforced in release/CI**
  - Format: workflow step / script usage
  - Location: `.github/workflows/*.yml`, `scripts/validate_counts.py`
  - Status: `validate_counts.py` created, `npm run validate:counts` wired, SOP updated. CI workflow integration pending.

- [ ] **D7: Security audit findings resolved**
  - Format: source code fixes + KB updates
  - Location: `src/cache/*.ts`, `src/config/loader.ts`, `src/connector/jira-connector.ts`, `src/utils/fs.ts`
  - Status: All HIGH/MEDIUM/LOW findings from hipaa-validate audit fixed (2026-04-14). See plan Section 14.

## 2. Verification Methods (HOW)

### Automated
- [ ] `npm run typecheck`
      Expected: 0 errors
- [ ] `npm run lint`
      Expected: 0 errors, 0 warnings
- [ ] `npm test`
      Expected: 100% passing
- [ ] `npm run test:coverage`
      Expected: coverage >= 70% overall
- [ ] `npm run build`
      Expected: success
- [ ] `python3 scripts/validate_counts.py`
      Expected: all counts in sync
- [ ] `npm pack --dry-run`
      Expected: package builds cleanly

### Manual / semi-manual
- [ ] Review `jira-mcp --help`, `jira-mcp config --help`, `jira-mcp cache --help`
- [ ] Smoke-check `tools/list` over the stdio flow
- [ ] Review documentation changes against actual code behavior
- [ ] Review the publish workflow against the release SOP and post-release SOP

### Security / dependency validation
- [ ] Re-run a CVE scan for key npm dependencies after upgrades
- [ ] No new runtime dependency without explicit justification

## 3. Quality Standards (DEFINITION OF DONE)

### Code quality
- [ ] Strict TypeScript remains intact
- [ ] Zero linting errors/warnings
- [ ] No broken public CLI or MCP interface
- [ ] No reduction of package installability from npm tarball

### Test quality
- [ ] `src/server.ts` has dedicated tests
- [ ] `src/cli.ts` / `src/cli/index.ts` bootstrap paths are covered
- [ ] `src/connector/jira-connector.ts` has tests for 204, 401, 403, 429/5xx, or equivalent transient failures, plus malformed responses where relevant
- [ ] Coverage remains >= 70% overall and improves on critical-path realism

### Release quality
- [ ] Publish workflow blocks release when any gate fails
- [ ] Release workflow reflects `kb/procedures/sop-release.md`
- [ ] Post-release smoke flow remains executable per `kb/procedures/sop-post-release-testing.md`

### Documentation quality
- [ ] README claims are factual and measurable
- [ ] Security statements do not overstate protections not present in code
- [ ] Architecture doc reflects current cache/config behavior

## 4. Acceptance Criteria (PASS / FAIL)

### Must Have (blocking)
- [ ] All deliverables D1–D7 completed
- [ ] All automated checks pass
- [ ] Publish workflow cannot publish on red quality gates
- [ ] Critical boundary tests exist and pass
- [x] Documentation parity issues identified in the audit are fixed (count drift, secondary doc hardcoded counts, KB updates — done 2026-04-14)
- [ ] No critical/high unresolved dependency risk remains in the selected release path
- [x] Security audit findings (HIGH: cache permissions, MEDIUM: CWD warning, LOW: error truncation) resolved (done 2026-04-14)

### Should Have (important)
- [ ] Node test matrix expanded to include at least the declared support baseline plus the current mainline version
- [ ] Retry/backoff implemented for transient Jira failures
- [ ] Coverage exclusions reduced and justified
- [ ] `validate_counts.py` enforced by CI, not only documented (script exists, SOP updated — CI integration pending)

### Nice to Have (optional)
- [ ] `src/server.ts` dispatch structure simplified after tests are in place
- [ ] Additional CLI `--json` / DX improvements captured as follow-up backlog
- [ ] Enterprise-readiness backlog drafted after hardening

## 5. Binary Completion Rule

**PASS** only if all Must Have items are complete and zero critical regressions remain.  
**FAIL** if any Must Have item is missing or any release-blocking regression remains.

## 6. Evidence to capture during execution

- test output summaries,
- coverage delta before/after,
- workflow diff,
- count validation output,
- npm dry-run output,
- dependency/CVE validation output.

