# Jira MCP Server

Tools: `sync_tasks`, `read_cached_tasks`, `update_task_status`, `update_task`, `add_task_comment`, `delete_task`, `delete_comment`, `reassign_task`, `get_task_statuses`, `get_task_details`, `get_project_language`, `log_task_time`, `get_task_time_tracking`, `list_comment_templates`, `add_templated_comment`, `create_task`, `search_tasks`

## Key Rules

- **Always `sync_tasks` first** before reading, because the cache may be stale.
- **Language first:** before writing ANY comment, description, or task content, call `get_project_language(project_key)` or check the `language` field in `get_task_details` response. Write ALL content in the project's configured language. Never assume Polish or English. Always check first.
- **Time format:** `"2h 30m"`, using hours and minutes only, never days.
- **Status changes:** call `get_task_statuses` first to check valid transitions.
- **Multi-instance:** project key determines which Jira instance is used (mapped in config.json).
- **Comments are ADF:** `add_task_comment` converts markdown to ADF (Atlassian Document Format) automatically.
- **Delete guard:** `delete_task` is allowed only for the task creator, and `delete_comment` is allowed only for the comment author. Both require explicit `user_approved=true`.
- **Templates:** use `list_comment_templates` to discover available templates, then `add_templated_comment` with `template_id` + `variables`.

## Writing Style

- **Write like a real team member:** use plain, direct language that sounds like an engineer writing to another human, not like polished AI copy or marketing text.
- **No em dash and no double-hyphen separator in prose:** do not use those punctuation patterns in generated comments, descriptions, docs, or summaries. Use commas, periods, or parentheses instead.
- **Avoid stock AI phrases:** do not use phrases like "worth noting", "it is important to understand", "in today's dynamic environment", "overall", "in conclusion", or similar generic filler.
- **Prefer concrete wording:** use specific facts, actions, examples, and decisions instead of abstract claims or padded qualifiers.
- **Avoid repetitive rhythm:** do not make every sentence or bullet sound structurally identical. Vary sentence length and openings when writing longer text.
- **Keep summaries short:** do not add forced wrap-up paragraphs unless the user explicitly asks for a summary.
- **Use a workmanlike tone:** prefer a slightly rough, practical style over text that sounds overly smooth, symmetrical, or "LLM-clean".

## Workflow

1. `sync_tasks(jql="assignee=currentUser() AND status!=Done")` to fetch fresh data
2. `read_cached_tasks()` to work offline
3. `get_task_details(task_key="PROJ-123")` for a deep dive into description and comments as markdown
4. `update_task_status(...)` / `add_task_comment(...)` / `log_task_time(...)` to mutate data

## Comment Templates (built-in)

| ID | Use for |
|----|---------|
| `status-update` | Progress report with completed/next/blockers |
| `blocker-notification` | Escalate blocking issue |
| `handoff-transition` | Task handoff between people |
| `review-request` | Request code review |
| `sprint-update` | Sprint progress report |
| `bug-report` | Structured bug report |
| `deployment-note` | Deployment documentation |
| `time-log-summary` | Time logging with description |

## CLI Commands

| Command | Description |
|---------|-------------|
| `jira-mcp config init` | Initialize global config (~/.softspark/jira-mcp/) |
| `jira-mcp config add-project <key> <url>` | Add Jira project mapping |
| `jira-mcp config remove-project <key>` | Remove a project |
| `jira-mcp config list-projects` | Show configured projects with language |
| `jira-mcp config set-default <key>` | Set default project |
| `jira-mcp config set-credentials` | Set API credentials |
| `jira-mcp config set-language <lang>` | Set global default language |
| `jira-mcp config set-project-language <key> <lang>` | Set language for a specific project |
| `jira-mcp create <path>` | Create tasks from template (dry-run default) |
| `jira-mcp create-monthly` | Create monthly admin tasks |
| `jira-mcp cache sync-users` | Cache user list for reassignment |
| `jira-mcp cache sync-workflows` | Cache status transitions |
| `jira-mcp cache list-users` | Show cached users |
| `jira-mcp cache list-workflows` | Show cached workflows |

## Architecture

Four layers. Each depends only on layers below.

1. **Types & Config** (`config/`, `errors/`, `*/types.ts`), pure data with zero runtime deps
2. **Infrastructure** (`connector/`, `cache/`, `adf/`, `templates/`), I/O and external APIs
3. **Business Logic** (`operations/`, `bulk/`), orchestrating infrastructure
4. **Entry Points** (`tools/`, `cli/`, `server.ts`), thin dispatchers

## Coding Conventions

- **Strict TypeScript**: `strict: true`, NO `any`, `readonly` interfaces, `import type`, `.js` imports
- **Zod schemas** for all external data: `type Foo = z.infer<typeof FooSchema>`
- **Error classes**: extend `JiraMcpError` with `code` property
- **ADF round-trip**: `markdownToAdf()` for writes and `adfToMarkdown()` for reads. NEVER throw.
- **InstancePool**: singleton, lazy connectors, dedup by URL
- **Dual-write**: after Jira mutation, update local cache, return API result
- **Dry-run default**: `--execute` required for destructive operations
- **DI pattern**: handlers accept `deps?` parameter for testing
- **Config path**: ALWAYS `~/.softspark/jira-mcp/` via `GLOBAL_CONFIG_DIR`, with no manual config and no env vars in MCP client setup
- **SoftSpark standard**: all open-source tools use `~/.softspark/<tool-name>/`. See SOP in rag-mcp `kb/procedures/softspark-config-standard.md`

## Testing

- **Vitest**: 70% coverage threshold, `vi.fn()` for mocks
- **No real Jira API calls** in tests, use `tests/fixtures/mocks.ts`
- **Filesystem tests**: `os.tmpdir()` + `mkdtemp()`, NEVER write to `~/.softspark/`
- Quick pre-commit: `npm run typecheck && npm run lint && npm test && npm run build`

## KB & SOPs

- `kb/reference/` for architecture, API, configuration, ADF, caching, and templates
- `kb/howto/` for setup, multi-instance usage, and CLI usage
- `kb/procedures/` for `sop-pre-commit`, `sop-release`, and `sop-post-release-testing`
