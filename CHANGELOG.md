# Changelog

All notable changes to `@softspark/jira-mcp` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

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
