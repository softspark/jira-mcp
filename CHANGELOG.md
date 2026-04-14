# Changelog

All notable changes to `@softspark/jira-mcp` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
