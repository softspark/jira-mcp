# jira-mcp

> MCP server for Jira integration -- multi-instance routing, ADF formatting, task caching, and comment templates via the Model Context Protocol.

[![CI](https://github.com/softspark/jira-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/softspark/jira-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@softspark/jira-mcp)](https://www.npmjs.com/package/@softspark/jira-mcp)
[![version](https://img.shields.io/badge/version-1.3.0-blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What's New in v1.4.0

- **`delete_task` and `delete_comment` tools** -- guarded destructive operations with ownership enforcement and explicit approval.
- **Markdown table support** -- `markdownToAdf()` converts tables to native ADF table nodes.
- **Hardened error handling** -- cache cleanup no longer swallows unexpected I/O errors.
- **561 tests** across 58 test files.

See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## Table of Contents

- [Install](#install)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)
- [Available Tools](#available-tools)
- [Comment Templates](#comment-templates)
- [Usage with Claude Code](#usage-with-claude-code)
- [Usage with Other MCP Clients](#usage-with-other-mcp-clients)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Install

```bash
npm install -g @softspark/jira-mcp
# or use directly
npx @softspark/jira-mcp
```

## Update

```bash
npm update -g @softspark/jira-mcp
```

## Configuration

### 1. Generate an API token

Go to [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) and create a token.

### 2. Initialize global config

```bash
jira-mcp config init
jira-mcp config set-credentials
jira-mcp config add-project
```

All configuration lives in `~/.softspark/jira-mcp/` (created by `jira-mcp config init`). This is the standard config directory for all SoftSpark open-source tools.

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
| `jira-mcp config init` | Initialize global config at `~/.softspark/jira-mcp/` |
| `jira-mcp config add-project <key> <url>` | Add a Jira project to config |
| `jira-mcp config remove-project <key>` | Remove a project from config |
| `jira-mcp config list-projects` | List all configured projects with language |
| `jira-mcp config set-credentials` | Set API credentials |
| `jira-mcp config set-default <key>` | Set default project |
| `jira-mcp config set-language <lang>` | Set global default language |
| `jira-mcp config set-project-language <key> <lang>` | Set language for a specific project |
| `jira-mcp cache sync-workflows` | Sync workflow status transitions |
| `jira-mcp cache sync-users` | Sync user list for reassignment |
| `jira-mcp cache list-workflows` | Show cached workflows |
| `jira-mcp cache list-users` | Show cached users |

## Available Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `sync_tasks` | Sync tasks from Jira to local cache | `project_key?`, `jql?` |
| `read_cached_tasks` | Read tasks from cache without hitting Jira | `task_key?` |
| `update_task_status` | Change task status via workflow transition | `task_key`, `status` |
| `update_task` | Update existing issue fields (markdown → ADF) | `task_key`, `summary?`, `description?`, `priority?`, `labels?` |
| `add_task_comment` | Add a markdown comment (auto-converted to ADF) | `task_key`, `comment`, `user_approved` |
| `delete_task` | Delete a task, only when the authenticated user is the task creator | `task_key`, `user_approved` |
| `delete_comment` | Delete a comment, only when the authenticated user is the comment author | `task_key`, `comment_id`, `user_approved` |
| `reassign_task` | Reassign or unassign a task | `task_key`, `assignee_email?` |
| `get_task_statuses` | Get valid workflow transitions for a task | `task_key` |
| `get_task_details` | Get full details with description, comments, and language | `task_key` |
| `get_project_language` | Get configured language for a project | `project_key` |
| `log_task_time` | Log work time (`"2h 30m"` format, no days) | `task_key`, `time_spent`, `comment?` |
| `get_task_time_tracking` | Get time tracking info (estimate, spent, remaining) | `task_key` |
| `list_comment_templates` | List available comment templates | `category?` |
| `list_task_templates` | List available task templates for `create_task` | — |
| `add_templated_comment` | Add comment using a template or raw markdown | `task_key`, `template_id?`, `variables?`, `markdown?`, `user_approved` |
| `create_task` | Create a new Jira issue with explicit fields or a task template | `project_key`, `summary?`, `template_id?`, `variables?`, `description?`, `assignee_email?`, `labels?`, `epic_key?` |
| `search_tasks` | Search Jira issues with JQL (no caching) | `jql`, `max_results?`, `project_key?` |

## Comment Templates

8 built-in templates organized by category:

| Template ID | Name | Category | Required Variables |
|-------------|------|----------|--------------------|
| `status-update` | Status Update | workflow | `completed`, `next_steps` |
| `blocker-notification` | Blocker Notification | communication | `blocked_by`, `impact`, `needed_action` |
| `handoff-transition` | Task Handoff | workflow | `from_person`, `to_person`, `context`, `remaining_work` |
| `review-request` | Review Request | communication | `reviewer`, `summary`, `link` |
| `sprint-update` | Sprint Update | reporting | `progress`, `risks` |
| `bug-report` | Bug Report | development | `steps`, `expected`, `actual` |
| `deployment-note` | Deployment Note | development | `changes`, `rollback_plan` |
| `time-log-summary` | Time Log Summary | reporting | `duration`, `work_description` |

### Using Templates

Example with Claude Code:

> "Add a status update to PROJ-123: completed auth module, next steps are testing, no blockers"

The AI will use `add_templated_comment` with `template_id: "status-update"` automatically.

### File-Backed Overrides

System templates are shipped as markdown files. User overrides are loaded from:

```text
~/.softspark/jira-mcp/templates/comments/
~/.softspark/jira-mcp/templates/task-templates/
```

If a user file has the same `id` as a system template, the user file wins globally for all projects.

```bash
jira-mcp template add comment ./my-status-update.md
jira-mcp template add task ./my-bug-task.md
jira-mcp template list
```

## Usage with Claude Code

Add to your Claude Code MCP configuration (`~/.claude/claude_desktop_config.json` or project-level):

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

Configuration is automatically loaded from `~/.softspark/jira-mcp/`. Run `jira-mcp config init` first to set up.

### AI Toolkit Rules

If you use `@softspark/ai-toolkit`, register the Jira rules so that Claude Code automatically follows project conventions (language checks, sync-first workflow, time format, etc.):

```bash
ai-toolkit rules add jira-mcp --path /path/to/jira-mcp/rules/jira-mcp.md
```

Or copy `rules/jira-mcp.md` to your ai-toolkit rules directory manually. The rules file covers:
- **Language first** -- always check project language before writing comments/descriptions
- **Sync before read** -- cache may be stale
- **Status transitions** -- check valid transitions before changing status
- **Time format** -- `"2h 30m"`, never days
- **All 18 MCP tools** and **20 CLI commands** reference

### AI Toolkit Hooks

To require explicit user approval before Jira comment writes, inject the repo-owned hook manifest:

```bash
ai-toolkit inject-hook https://raw.githubusercontent.com/softspark/jira-mcp/main/hooks/jira-mcp-hooks.json
```

This installs a `PreToolUse` guard for `add_task_comment` and `add_templated_comment`. The hook blocks the tool call, shows the exact comment preview, and tells the agent to retry only after the user approves it with `user_approved=true`.

The MCP server still enforces `user_approved=true` at runtime, so the hook is UX guidance plus an extra safety layer rather than the only check.

## Usage with Other MCP Clients

Any MCP client that supports stdio transport can use this server:

```json
{
  "command": "npx",
  "args": ["@softspark/jira-mcp"],
  "transport": "stdio"
}
```

Configuration is loaded from `~/.softspark/jira-mcp/` automatically. No environment variables needed.

## Architecture

```
src/
  adf/            Atlassian Document Format conversion (MD <-> ADF)
  bulk/           Bulk task creator (dry-run, rate limiting, bilingual)
  cache/          Local task, workflow, and user caching (JSON files)
  cli/            CLI entry point and subcommand handlers
    commands/
      cache/      Cache management subcommands
      config/     Config management subcommands
      template/   File-backed template management subcommands
      create.ts   Bulk task creation command
      create-monthly.ts  Monthly admin task automation
  config/         Configuration loading and Zod validation
  connector/      Jira API client (built-in fetch, instance pool)
  errors/         Typed error hierarchy
  operations/     Business logic (status, comments, time tracking)
  templates/      File-backed comment/task template loading and registries
  tools/          MCP tool handlers (18 tools, one file per tool)
  types/          Shared TypeScript types
  server.ts       MCP server setup and tool registration
  cli.ts          CLI entry point
```

## Key Features

**Multi-instance routing** -- single server manages multiple Jira Cloud/Server instances. Project key determines which instance handles the request. Connectors deduplicated by URL via [InstancePool](kb/reference/architecture.md).

**ADF round-trip** -- comments and descriptions use Atlassian Document Format natively. Markdown in, ADF to Jira v3 API, ADF back to readable markdown. Never loses formatting. See [ADF Reference](kb/reference/adf.md).

**Local caching** -- tasks synced to `~/.softspark/jira-mcp/cache/` with atomic writes (tmp + rename). Work offline with `read_cached_tasks`, sync on demand. Workflow and user caches for status validation and assignee resolution.

**File-backed templates** -- 8 built-in comment templates and built-in task templates are stored as markdown files, with global user overrides loaded from `~/.softspark/jira-mcp/templates/`. Both support `{{variable}}` interpolation and `{{#var}}...{{/var}}` conditional blocks. See [Templates Reference](kb/reference/templates.md).

**Language configuration** -- global `default_language` with per-project override. Supports: pl, en, de, es, fr, pt, it, nl. `get_project_language` tool and `language` field in `get_task_details` let AI assistants write content in the correct language. See [Configuration](kb/reference/configuration.md).

**Bulk task creation** -- create tasks from JSON configs with dry-run default, rate limiting, epic link discovery, assignee caching, multilingual support (8 languages), and idempotent updates. See [CLI Usage](kb/howto/cli-usage.md).

**Per-instance credentials** -- different API tokens per Jira instance URL. Single-credential format still works (backward compatible). See [Configuration](kb/reference/configuration.md).

**Supply chain protection** -- `ignore-scripts=true`, no axios, no dynamic requires. Self-contained 520KB bundle, 1 runtime dep (commander).

**Typed error hierarchy** -- 20 error classes with machine-readable codes. Every tool returns structured `{ success, error, code }` responses. No stack traces leak to MCP clients.

**Strict TypeScript** -- `strict: true`, no `any`, `readonly` interfaces, Zod validation at all boundaries, 558 tests across 58 test files. Self-contained 520KB package.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](kb/reference/architecture.md) | System design and module overview |
| [API Reference](kb/reference/api.md) | All 18 MCP tools with schemas |
| [Configuration](kb/reference/configuration.md) | Config files, env vars, multi-instance |
| [ADF Format](kb/reference/adf.md) | Atlassian Document Format conversion |
| [Caching](kb/reference/caching.md) | Task, workflow, and user caching |
| [Templates](kb/reference/templates.md) | Comment and task templates |
| [Setup Guide](kb/howto/setup.md) | Getting started step-by-step |
| [CLI Usage](kb/howto/cli-usage.md) | Complete CLI reference |
| [Multi-Instance](kb/howto/multi-instance.md) | Multiple Jira instances |
| [Troubleshooting](kb/troubleshooting/common-issues.md) | Common issues and fixes |

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) -- SoftSpark

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

Built at [SoftSpark](https://softspark.eu). Designed for AI-assisted Jira workflows.
