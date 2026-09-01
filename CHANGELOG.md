# Changelog

All notable changes to `@softspark/jira-mcp` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## v1.10.0 -- Remaining Estimate (2026-09-01)

### Added

- **`remaining_estimate` in `update_task`** -- writes `timetracking.remainingEstimate`.
  Jira keeps the two estimates independent: setting `original_estimate` on a parent
  issue leaves its remaining estimate at the old value, so a report that sums
  remaining still showed the pre-edit total. Setting one field does not disturb
  the other, and both can be sent in a single call. Same format and day rejection
  as `original_estimate`.

## v1.9.0 -- Sub-tasks and Estimates (2026-09-01)

### Added

- **`parent_key` in `create_task`** -- sets the Jira `parent` field so sub-tasks can be
  created at all. `epic_key` resolves the Epic Link custom field, which is a different
  field, so passing it for a sub-task made Jira answer with
  `Issue type is a sub-task but parent issue key or id not specified`.
- **`original_estimate` in `create_task` and `update_task`** -- writes
  `timetracking.originalEstimate`. Estimates could only be set by hand in the Jira UI
  before; `log_task_time` logs work already done, which is a different field.
  Accepts the same `"2h"` / `"30m"` / `"2h 30m"` format as `log_task_time` and rejects
  days through the same parser.

## v1.8.1 -- Duplicate Detection (2026-08-03)

### Fixed

- **Duplicate detection never matched anything.** `findExistingTask` searched with
  `summary = "..."`, but `summary` is a text field and JQL only supports `~` on it.
  Jira answers `=` with an empty result set instead of an error, so every lookup
  reported "not found": `update_existing` never updated, and re-running a bulk config
  created a second copy of every task. The lookup now uses a quoted `~` phrase and
  compares the returned summary exactly, since `~` is a fuzzy match. Found by running
  a config twice against a live instance and getting a duplicate issue.

## v1.8.0 -- Status Paths (2026-08-03)

### Added

- **`status` accepts an ordered path** in bulk task configs -- `"status": ["On hold", "Open"]`
  walks the transitions one at a time. Jira only exposes the transitions available from an
  issue's *current* status, so a target that is not directly reachable from the initial
  status could not be set at all before. A plain string still means a single transition.
- **`warnings` in `create_monthly_tasks` output** -- per-task problems that did not stop the
  issue from being written now surface in the tool response instead of being dropped by the
  counters-only summary.

### Fixed

- **A rejected status transition is no longer silent.** `setStatus` swallowed every failure,
  including the ordinary case of the requested status simply not being reachable: the issue
  was created, the status was ignored, and the run reported `failed: 0`. Eleven monthly admin
  tasks sat in the wrong status for months because of this. The transition is now reported as
  a `warning` on the task result, naming the status that failed and listing the ones that were
  reachable at that point. The issue itself is still created -- the transition stays non-fatal.

### Changed

- **`TaskResult` gains a `warning` field** (`string | null`). `formatBulkResult` prints it
  indented under the task line. Consumers destructuring `TaskResult` are unaffected; anyone
  constructing one now has to supply the field.



### Changed -- licence: MIT to Apache-2.0

The project is now licensed under the Apache License 2.0. It stays permissive:
fork it, modify it, ship it commercially. What changes is what a redistributor
owes back.

- **`NOTICE` is the point.** MIT already required keeping the copyright notice, so
  attribution is not new. Apache-2.0 adds section 4(d): a redistributor must carry
  the contents of `NOTICE` -- project name, copyright, source URL -- into their
  distribution. `NOTICE` is in `package.json` `files`, so it ships with the package.
- **Modified files must say so** (section 4b), an express patent grant with
  retaliation (section 3), and no rights to the project or company names
  (section 6). None of these existed under MIT.
- **Attribution reaches the published bundles through a build banner.** This is
  the part specific to this package: npm ships `dist/`, not `src/`, and the build
  runs with `minify: true`, which strips every comment. SPDX headers in `src/`
  are for whoever clones the repository; consumers see the tsup `banner`, now
  present in both `dist/index.js` and `dist/cli.js`.
- **SPDX headers on 165 source files**, placed after any shebang.
- **Nothing is revoked.** Releases up to and including v1.6.0 were published under
  MIT and remain available under MIT. All contributions were made by the
  copyright holder, so no third-party permission was required.

`LICENSE` holds the verbatim Apache-2.0 text, cross-verified against two
independent published copies before being written.

### Tests

- `tests/licensing.test.ts`, 8 assertions run by `npm test`: SPDX headers present
  and naming Apache-2.0, `LICENSE` complete, `NOTICE` carrying attribution and
  section 4(d), both files in `package.json` `files`, `package.json` declaring
  Apache-2.0, and **both build entries carrying the licence banner**. The banner
  assertion exists because losing it would strip attribution from the published
  artifact while every other check stayed green.

---

## v1.6.0 -- ADF Nested Lists, Task Lists & Doc-Parity Gates (2026-06-10)

### Added
- **Nested list support in ADF conversion** -- indented markdown lists (2 spaces or tab) now produce properly nested `bulletList`/`orderedList` ADF nodes instead of being flattened, in both write and read directions. Read direction renders nesting with 2-space indentation.
- **Task list (checkbox) support** -- `- [ ]` / `- [x]` markdown converts to ADF `taskList`/`taskItem` nodes (Jira checkboxes) with document-unique `localId`s, and renders back to markdown checkboxes including nesting. Nested bullet/ordered lists under a task item are lifted to siblings after the task list to keep the ADF valid.
- **Image degradation** -- `![alt](url)` markdown converts to a link (alt text as label, URL as fallback) instead of leaking a stray `!` into the text. ADF media nodes require uploaded attachments, so a link is the lossless-enough fallback.
- **`date` node rendering on read** -- ADF date nodes now render as `YYYY-MM-DD` instead of disappearing from task descriptions and comments.
- **Doc-parity checks in `validate_counts.py`** -- the validator now also verifies the README version badge against `package.json`, and that every MCP tool from `definitions.ts` is documented in `kb/reference/api.md` and named in `rules/jira-mcp.md`.

### Changed
- **CI enforces the coverage gate** -- the test job runs `npm run test:coverage`, so the 70% thresholds (lines, branches, functions) actually block merges. Branch coverage raised from 64.5% to above the threshold with new CLI and ADF edge-case tests.

### Fixed
- **README version badge drift** (1.4.3 -> 1.5.0) and stale test counts.
- **`kb/reference/api.md`** now documents `search_tasks`, `delete_task`, and `delete_comment`, which were missing despite the "complete reference" claim.
- **`rules/jira-mcp.md` / `AGENTS.md`** tool list extended to all 19 tools (was 17) and the CLI table extended to all 20 commands (was 14).
- **Dev dependency vulnerabilities** -- `npm audit fix` applied (7 advisories: fast-uri, brace-expansion, hono, ip-address chains). Runtime dependencies were and remain clean.

---

## v1.5.0 -- Bulk Template Management & Monthly Tasks Tool (2026-05-04)

### Added
- **`template add bulk` CLI command** -- new third template kind alongside `comment` and `task`. Validates the source JSON against `BulkConfigSchema` and installs it under `~/.softspark/jira-mcp/templates/tasks/<KEY>/monthly_admin.json`. `template list/show/remove` also support the `bulk` kind, keyed by project. Prunes the empty project subdirectory on remove.
- **`create_monthly_tasks` MCP tool** -- exposes the existing `create-monthly` CLI handler over the protocol. Inputs: `{ execute?: boolean, project?: string }`. Returns a structured result with per-project status (success/error), summary counts, and the resolved config path. Lets MCP clients run monthly bulk task creation without dropping to the CLI.

## v1.4.3 -- JQL Escape & Cache Recovery (2026-04-18)

### Fixed
- **`sync_tasks` default JQL parse error** -- `escapeJql` was over-escaping JQL operators (`-`, `+`, `&`, `|`, etc.) inside double-quoted string literals. Jira rejected the resulting query with `'\-' jest niedozwoloną sekwencją modyfikacji JQL`. The escape now only handles `\` and `"` (the only sequences valid inside a quoted JQL string), so `sync_tasks` works without an explicit `jql` argument when the username contains a hyphen.
- **`reassign_task` / `update_task_status` cache miss after Jira mutation** -- both operations now recover from a cache miss by fetching the task from Jira via `connector.getIssue` and upserting it into the local cache. Previously, calling either tool right after `create_task` (cache not populated) or `log_task_time` (cache invalidated) failed with `TASK_NOT_FOUND` even though the Jira mutation succeeded.

### Added
- **`CacheManager.upsertTask(task)`** -- inserts a task or replaces it by key, tolerating a missing cache file. Used by the new mutation-recovery path.

## v1.4.2 -- Supply-Chain Hardening (2026-04-18)

### Added
- **npm provenance attestation** -- `publish.yml` now publishes with `--provenance` and `id-token: write`, producing a SLSA v1 attestation on every release. Consumers can verify via `npm audit signatures` or the Provenance badge on npmjs.com.
- **Supply-chain gates in release SOP** -- `kb/procedures/sop-release.md` adds a pre-tag check for `--provenance` and `id-token: write` in `publish.yml`, plus a post-publish step that asserts `predicateType == https://slsa.dev/provenance/v1`.
- **Provenance verification in post-release SOP** -- `kb/procedures/sop-post-release-testing.md` adds Phase 5 covering the SLSA attestation check, `npm audit signatures`, and the npmjs.com Provenance badge.
- **Version-sync step in pre-commit SOP** -- `kb/procedures/sop-pre-commit.md` adds Step 6 verifying `package.json` and `package-lock.json` agree on the `version` field.

### Changed
- **Release workflow permissions** -- `packages: write` and `id-token: write` added to `.github/workflows/publish.yml` for OIDC attestation.
- **Release commit now stages the lockfile** -- SOP Phase 5 stages `package.json`, `package-lock.json`, `CHANGELOG.md`, and `README.md`. Prevents lockfile drift between tags.

### Fixed
- **`package-lock.json` top-level version drift** -- lockfile root `version` was stuck at `1.0.0` across prior releases. Regenerated via `npm install --package-lock-only` and now matches `package.json` on every release commit.

## v1.4.1 -- Template Loading Fix (2026-04-15)

### Fixed
- **File-backed templates missing after install** -- `PACKAGE_ROOT_DIR` used a hardcoded `../..` relative depth that resolved correctly in the source layout but overshot by one level after tsup bundling. Replaced with `findPackageRoot()` that walks up looking for `package.json`. All 8 built-in comment templates now load correctly from global installs.

## v1.4.0 -- Delete Tools & Error Hardening (2026-04-15)

### Added
- **`delete_task` tool** -- delete a Jira issue with ownership enforcement (creator only) and explicit user approval guard.
- **`delete_comment` tool** -- delete a comment with ownership enforcement (author only) and explicit user approval guard.
- **Markdown table support in ADF** -- `markdownToAdf()` now converts markdown tables to ADF table nodes.

### Changed
- **Narrowed cache cleanup catch blocks** -- `deleteTask()` and `logTime()` now catch only `TaskNotFoundError` and `CacheNotFoundError` instead of swallowing all exceptions. Unexpected I/O or corruption errors propagate.

### Fixed
- **Silent cache errors** -- cache I/O failures during post-delete and post-worklog cleanup were silently ignored, leaving stale entries without any signal.

## v1.3.0 -- File-Backed Templates & Approval Hooks (2026-04-15)

### Added
- **File-backed template catalog** -- ship built-in comment and single-task templates as physical markdown files under `templates-system/`.
- **Template management CLI** -- add `jira-mcp template add/list/show/remove` for global user overrides in `~/.softspark/jira-mcp/templates/`.
- **Task templates for `create_task`** -- add `list_task_templates` and template-based issue creation with variable rendering.
- **Comment approval hook manifest** -- ship `hooks/jira-mcp-hooks.json` for ai-toolkit `inject-hook` flows that preview and gate Jira comment writes.

### Changed
- **Template loading model** -- resolve active templates from system files plus global user overrides, with user files winning on `id` collisions.
- **Configuration init** -- create dedicated template directories for comments, single-task templates, and bulk task configs.
- **README validation** -- exclude internal tool helpers from MCP tool counts and refresh counts to match the current source tree.

### Fixed
- **Comment write safety** -- require explicit `user_approved=true` before `add_task_comment` and `add_templated_comment` can mutate Jira.
- **Comment preview flow** -- render templated comment previews before execution so approval can target the exact outgoing markdown.

## v1.2.0 -- Per-Instance Credentials & Jira API Migration (2026-04-14)

### Added
- **Per-instance credentials** -- `set-credentials --url` flag allows different API tokens per Jira instance. Auto-migrates legacy Format A to Format B on first use.
- **Live Jira API smoke tests** -- post-release SOP now includes Phase 4 with 15 steps testing all MCP tools against the KAN sandbox project.
- **`validate_counts.py` in pre-commit SOP** -- added as Step 5 to catch README count drift before commit.

### Changed
- **Search endpoint migrated** -- `/rest/api/3/search` → `/rest/api/3/search/jql` (Jira Cloud deprecated the old endpoint with HTTP 410).
- **`set-credentials` CLI** -- read-modify-write instead of overwrite. Preserves existing credentials when adding instance overrides.

### Fixed
- **Jira Cloud 410 on sync/search** -- `sync_tasks` and `search_tasks` failed on instances where Jira had removed the legacy search endpoint.

---

## v1.1.0 -- Hardening & Market Readiness (2026-04-14)

### Added
- **Boundary test suite** -- 96 new tests covering `server.ts` (25), `cli/index.ts` (27), and `JiraConnector` (44). Total: 509 tests across 51 files.
- **Retry/backoff for transient failures** -- `JiraConnector` retries 429 and 503 responses up to 3 times with exponential backoff (1s/2s/4s). Respects `Retry-After` header.
- **Count validation script** -- `scripts/validate_counts.py` verifies README counts match source code. Enforced in CI via `validate-counts` job.
- **Count validation in CI** -- new `validate-counts` job in `ci.yml` catches README drift before merge.
- **ADR-0001** -- documented "hardening before refactor" decision with alternatives and guardrails.
- **Hardening plan** -- full plan with success criteria and pre-mortem in `kb/planning/`.

### Changed
- **server.ts refactored** -- 719 → 324 lines (-55%). Tool definitions extracted to `src/tools/definitions.ts`, argument helpers to `src/tools/args.ts`.
- **Major dependency upgrades** -- TypeScript 5 → 6, ESLint 9 → 10, zod 3 → 4, vitest 3 → 4, @types/node 22 → 25.
- **TypeScript 6 migration** -- added `types: ["node"]` and `ignoreDeprecations: "6.0"` to tsconfig.
- **zod 4 migration** -- `.default({})` replaced with factory function in `BulkOptionsSchema`.
- **vitest 4 migration** -- arrow function mocks replaced with regular function syntax for constructor compatibility.
- **Bundle size** -- 325KB → 520KB (due to zod 4, which is significantly larger).
- **README** -- "Zero runtime dependencies" corrected to "Minimal runtime dependencies". Test counts updated.
- **CONTRIBUTING.md** -- full CI workflow documented, `validate:counts` noted as maintainer-managed.
- **Coverage exclusions reduced** -- `server.ts` and `jira-connector.ts` removed from vitest exclusion list.

### Security
- **Cache file permissions** -- all cache writes use `mode: 0o600` (owner-only). Prevents local privilege escalation on shared machines.
- **CWD config loading warning** -- stderr warning when `config.json` or `credentials.json` loaded from working directory instead of global config.
- **Error message truncation** -- Jira API error responses truncated to 200 characters to prevent information leakage.
- **`saveJsonFile` JSDoc** -- `@security` annotation warns against use for sensitive data.

### Documentation
- **Hardcoded counts removed** from secondary docs (CLAUDE.md, kb/, rules/, copilot-instructions). Counts live only in README (single source of truth pattern from ai-toolkit).
- **KB docs updated** -- caching.md, architecture.md, configuration.md, troubleshooting/common-issues.md reflect security changes.
- **Release SOP updated** -- Step 4.5 (validate counts) and Step 3.2 (README "What's New" update) added.

---

## v1.0.0 -- Initial Public Release (2026-04-14)

### MCP Tools (15)

- **`sync_tasks`** -- sync Jira tasks to local cache with optional JQL filter
- **`read_cached_tasks`** -- read tasks from local cache without hitting Jira
- **`update_task_status`** -- change task status via workflow transition
- **`update_task`** -- update existing issue fields (summary, description, priority, labels) with ADF conversion
- **`add_task_comment`** -- add markdown comment (auto-converted to ADF)
- **`reassign_task`** -- reassign or unassign a task by email
- **`get_task_statuses`** -- get valid workflow transitions for a task
- **`get_task_details`** -- get full details with description, comments, and project language
- **`get_project_language`** -- get configured language for a project (for AI assistants)
- **`log_task_time`** -- log work time in `"2h 30m"` format
- **`get_task_time_tracking`** -- get time tracking info (estimate, spent, remaining)
- **`list_comment_templates`** -- list available comment templates by category
- **`add_templated_comment`** -- add comment using a template with variable interpolation
- **`create_task`** -- create a new Jira issue with ADF description, assignee, labels, epic link
- **`search_tasks`** -- search Jira issues with raw JQL (no caching)

### CLI Commands (16)

- **`jira-mcp`** / **`jira-mcp serve`** -- start MCP server (stdio transport)
- **`jira-mcp config init`** -- initialize global config at `~/.softspark/jira-mcp/`
- **`jira-mcp config add-project <key> <url>`** -- add a Jira project mapping
- **`jira-mcp config remove-project <key>`** -- remove a project
- **`jira-mcp config list-projects`** -- show configured projects with language column
- **`jira-mcp config set-credentials`** -- set API credentials
- **`jira-mcp config set-default <key>`** -- set default project
- **`jira-mcp config set-language <lang>`** -- set global default language
- **`jira-mcp config set-project-language <key> <lang>`** -- set language for a specific project
- **`jira-mcp create <path>`** -- create tasks from bulk config file (dry-run by default)
- **`jira-mcp create-monthly`** -- run monthly admin task templates
- **`jira-mcp cache sync-workflows`** -- sync workflow status transitions
- **`jira-mcp cache sync-users`** -- sync user list for reassignment
- **`jira-mcp cache list-workflows`** -- show cached workflows
- **`jira-mcp cache list-users`** -- show cached users

### Features

- **Multi-instance routing** -- single server manages multiple Jira Cloud/Server instances. Project key determines routing. Connectors deduplicated by URL via InstancePool.
- **Language configuration** -- global `default_language` with per-project override. Supports: pl, en, de, es, fr, pt, it, nl. AI assistants check language before writing content.
- **ADF round-trip** -- bidirectional Markdown ↔ Atlassian Document Format conversion. Zero-dependency built-in parsers (~330 lines each). Literal `\n` normalization for MCP tool parameters.
- **Local caching** -- tasks synced to `~/.softspark/jira-mcp/cache/` with atomic writes. Workflow and user caches for offline status validation and assignee resolution.
- **Comment templates** -- 8 built-in templates with `{{variable}}` interpolation and `{{#var}}...{{/var}}` conditional blocks.
- **Bulk task creation** -- JSON config templates with dry-run default, rate limiting, epic link discovery, bilingual support (8 languages), idempotent updates.
- **Per-instance credentials** -- Format A (single credential) and Format B (per-URL credentials with default fallback). Backward compatible.
- **Supply chain protection** -- `ignore-scripts=true`, no axios, no dynamic requires. Self-contained 325KB bundle, 1 runtime dep (commander).
- **Strict TypeScript** -- `strict: true`, no `any`, `readonly` interfaces, Zod validation at all boundaries. 413 tests across 47 test files.
- **Typed error hierarchy** -- 15 error classes with machine-readable codes. Structured `{ success, error, code }` responses.

### Architecture

Four layers -- each depends only on layers below:

1. **Types & Config** (`config/`, `errors/`, `*/types.ts`) -- pure data, zero runtime deps
2. **Infrastructure** (`connector/`, `cache/`, `adf/`, `templates/`) -- I/O and external APIs
3. **Business Logic** (`operations/`, `bulk/`) -- orchestrates infrastructure
4. **Entry Points** (`tools/`, `cli/`, `server.ts`) -- thin dispatchers

### AI Toolkit Integration

- **Rules file** (`rules/jira-mcp.md`) -- register with `ai-toolkit add-rule` for automatic language checks, sync-first workflow, and tool reference injection.
- **GitHub Copilot** (`.github/copilot-instructions.md`) -- full project context for Copilot-assisted development.
