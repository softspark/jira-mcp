# Jira MCP Server

Tools: `sync_tasks`, `read_cached_tasks`, `update_task_status`, `update_task`, `add_task_comment`, `delete_task`, `delete_comment`, `reassign_task`, `get_task_statuses`, `get_task_details`, `get_project_language`, `log_task_time`, `get_task_time_tracking`, `list_comment_templates`, `add_templated_comment`, `list_task_templates`, `create_task`, `create_monthly_tasks`, `search_tasks`, `search_tempo_worklogs`, `get_tempo_report`

## Key Rules

- **Always `sync_tasks` first** before reading, because the cache may be stale.
- **Language first:** before writing ANY comment, description, or task content, call `get_project_language(project_key)` or check the `language` field in `get_task_details` response. Write ALL content in the project's configured language. Never assume Polish or English. Always check first.
- **Time format:** `"2h 30m"`, using hours and minutes only, never days.
- **Tempo hours are Tempo's, not Jira's:** `get_task_time_tracking` reads Jira's own time tracking. `search_tempo_worklogs` and `get_tempo_report` read Tempo Timesheets and need a Tempo token (`jira-mcp config set-tempo-token`), otherwise they fail with `TEMPO_NOT_CONFIGURED`. Dates are `YYYY-MM-DD` and inclusive. Use `get_tempo_report` for totals (`group_by` any order of `project`, `user`, `task`; default project then user) and `search_tempo_worklogs` only when the individual entries matter. Filters combine: `project_key` + `user_email` is one person's time on one project.
- **Status changes:** call `get_task_statuses` first to check valid transitions.
- **Multi-instance:** project key determines which Jira instance is used (mapped in config.json).
- **Comments are ADF:** `add_task_comment` converts markdown to ADF (Atlassian Document Format) automatically.
- **Delete guard:** `delete_task` is allowed only for the task creator, and `delete_comment` is allowed only for the comment author. Both require explicit `user_approved=true`.
- **Templates:** use `list_comment_templates` to discover available templates, then `add_templated_comment` with `template_id` + `variables`.
- **Shipped templates are English, with translations available.** `jira-mcp template list-locales` shows which languages ship translated comment templates, and `jira-mcp template install-locale <lang>` installs them as overrides. Their headings ("Status Update", "Completed", "Blockers") are fixed text, and no template carries a language. On a project whose configured language is not English, a shipped template posts an English comment and breaks the language-first rule. Use `add_templated_comment` with `markdown` instead, or install a translated override of the same `id` in `~/.softspark/jira-mcp/templates/comments/`. Trust `list_comment_templates` over this list: an installation may have overridden any of them.
- **The template catalog is read once, at server startup.** `jira-mcp template add` changes what the CLI reports immediately, but a running MCP server keeps serving the catalog it loaded when it started. After installing or editing a template, restart the MCP client, or the next `add_templated_comment` silently renders the old version.

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

## Tempo Reporting

Read-only. Needs `tempo_token` on the site's credential (`jira-mcp config set-tempo-token`); without it the two tools answer `TEMPO_NOT_CONFIGURED` and nothing else is affected.

| Question | Call |
|----------|------|
| Hours in project X in a period, by person | `get_tempo_report(from, to, project_key="X")` |
| What user Y logged, on which projects and tasks | `get_tempo_report(from, to, user_email="y@…", group_by=["project", "task"])` |
| Who logged how much on task Z | `get_tempo_report(from, to, task_key="Z", group_by=["user"])` |
| Hours per task in project X | `get_tempo_report(from, to, project_key="X", group_by=["task"])` |
| Hours per project across the site | `get_tempo_report(from, to, group_by=["project"])` |
| The individual entries (dates, descriptions, start times) | `search_tempo_worklogs(from, to, …)` |

1. Ask for the period when it is missing; never guess a month. Dates are `YYYY-MM-DD`, inclusive, `from <= to`.
2. `project_key`, else the `task_key` prefix, else the default project picks the Jira instance. A `task_key` outside `project_key` is an error, not a re-route.
3. Prefer `get_tempo_report`. `search_tempo_worklogs` returns at most 2000 entries (`limit`, default 200), but `total_time_spent` always covers the full match and `truncated: true` says the list was cut.
4. `task_key: "#12345"` with summary `(issue not visible)` means Tempo has the hours but the Jira token cannot browse the issue. Report the hours and say the issue is hidden; do not drop the row.
5. `user_email: null` on a row is Atlassian privacy, not an unknown user. Grouping uses the account id, so the per-person totals are still right.
6. Tempo totals and `get_task_time_tracking` differ by design: Tempo is the timesheet, Jira's field is native worklogs. Never add the two.
7. `hours` is decimal (two places) for spreadsheets; `time_spent` is the same value as `"2h 30m"`. Quote whichever the user asked for, not both.

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
| `jira-mcp` | Start MCP server (default) |
| `jira-mcp serve` | Start MCP server (explicit) |
| `jira-mcp create <path>` | Create tasks from config file (dry-run by default) |
| `jira-mcp create-monthly` | Create monthly admin tasks from built-in templates |
| `jira-mcp template add <type> <path>` | Install a template override from a local markdown file |
| `jira-mcp template list [type]` | List active comment/task templates |
| `jira-mcp template show <type> <id>` | Show the active template file content |
| `jira-mcp template remove <type> <id>` | Remove a user-installed template override |
| `jira-mcp template list-locales` | List languages with shipped template translations |
| `jira-mcp template install-locale <lang> [--keep-english]` | Install translated comment templates |
| `jira-mcp config init` | Initialize global config (~/.softspark/jira-mcp/) |
| `jira-mcp config add-project <key> <url>` | Add Jira project mapping |
| `jira-mcp config remove-project <key>` | Remove a project |
| `jira-mcp config list-projects` | Show configured projects with language |
| `jira-mcp config set-credentials` | Set API credentials |
| `jira-mcp config set-tempo-token` | Set the Tempo API token (default site or `--url`) |
| `jira-mcp config set-default <key>` | Set default project |
| `jira-mcp config set-language <lang>` | Set global default language |
| `jira-mcp config set-project-language <key> <lang>` | Set language for a specific project |
| `jira-mcp cache sync-workflows` | Cache status transitions |
| `jira-mcp cache sync-users` | Cache user list for reassignment |
| `jira-mcp cache list-workflows` | Show cached workflows |
| `jira-mcp cache list-users` | Show cached users |

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
