# @softspark/jira-mcp

## Overview
MCP server for Jira integration -- multi-instance routing, ADF formatting, task caching, and comment templates.

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js >= 18
- **MCP SDK**: @modelcontextprotocol/sdk
- **Jira client**: built-in fetch (REST API v3)
- **ADF**: built-in zero-dependency converters (MD<->ADF)
- **Validation**: zod
- **Build**: tsup
- **Test**: vitest
- **Lint**: ESLint 9 (flat config)

## Commands
```bash
npm run build         # Build with tsup
npm run dev           # Dev mode (tsx)
npm test              # Vitest
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test:coverage # Coverage report
```

## CLI Commands
| Command | Description |
|---------|-------------|
| `jira-mcp` | Start MCP server (default) |
| `jira-mcp serve` | Start MCP server (explicit) |
| `jira-mcp create <path>` | Create tasks from config (dry-run by default) |
| `jira-mcp create-monthly` | Create monthly admin tasks |
| `jira-mcp config init` | Initialize global config at `~/.softspark/jira-mcp/` |
| `jira-mcp config add-project` | Add a Jira project |
| `jira-mcp config remove-project` | Remove a project |
| `jira-mcp config list-projects` | List configured projects |
| `jira-mcp config set-credentials` | Set API credentials |
| `jira-mcp config set-default` | Set default project |
| `jira-mcp cache sync-workflows` | Sync workflow status transitions |
| `jira-mcp cache sync-users` | Sync user list |
| `jira-mcp cache list-workflows` | Show cached workflows |
| `jira-mcp cache list-users` | Show cached users |

## Key Conventions
- Conventional Commits (feat:, fix:, refactor:, test:, docs:, chore:)
- Branch names: feat/, fix/, refactor/, docs/, test/
- Strict TypeScript: no `any`, `readonly` interfaces, explicit return types
- ESM-first (`"type": "module"`)
- Jira credentials via config files, never hardcoded
- ADF for all Jira v3 API interactions (comments, descriptions)
- Global config in `~/.softspark/jira-mcp/` (never commit credentials)

## MCP Tools
Tools: sync_tasks, read_cached_tasks, update_task_status, update_task, add_task_comment, reassign_task, get_task_statuses, get_task_details, get_project_language, log_task_time, get_task_time_tracking, list_comment_templates, add_templated_comment, create_task, search_tasks

## Bulk Task Creation
Use `jira-mcp create <path>` to create tasks from a YAML/JSON config file. Always run with `--dry-run` first to verify output. Supports rate limiting and bilingual task titles. Monthly admin tasks via `jira-mcp create-monthly`.

## MCP Servers
Config auto-loaded from `~/.softspark/jira-mcp/`. No env vars needed.
```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["@softspark/jira-mcp"]
    }
  }
}
```

## Documentation
Full documentation lives in `kb/`. Key references:

| Document | Path |
|----------|------|
| Architecture | `kb/reference/architecture.md` |
| API Reference | `kb/reference/api.md` |
| Configuration | `kb/reference/configuration.md` |
| ADF Format | `kb/reference/adf.md` |
| Caching | `kb/reference/caching.md` |
| Templates | `kb/reference/templates.md` |
| Setup Guide | `kb/howto/setup.md` |
| CLI Usage | `kb/howto/cli-usage.md` |
| Multi-Instance | `kb/howto/multi-instance.md` |
| Troubleshooting | `kb/troubleshooting/common-issues.md` |

## SOPs
- Pre-commit checklist: `kb/procedures/sop-pre-commit.md`
- Release process: `kb/procedures/sop-release.md`
- Post-release smoke tests: `kb/procedures/sop-post-release-testing.md`
