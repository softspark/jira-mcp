---
title: "Jira MCP CLI Reference"
category: howto
service: jira-mcp
tags: [cli, commands, reference, config, cache, bulk-create]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Complete reference for all jira-mcp CLI commands, options, and usage examples."
---

# Jira MCP CLI Reference

The `jira-mcp` binary exposes commands for configuration management, cache maintenance, and bulk task creation. Running `jira-mcp` with no subcommand starts the MCP server.

## Top-level usage

```
jira-mcp [command] [options]
```

| Invocation | Effect |
|------------|--------|
| `jira-mcp` | Start the MCP server (default) |
| `jira-mcp serve` | Start the MCP server (explicit alias) |
| `jira-mcp --version` | Print version number |
| `jira-mcp --help` | List all commands |
| `jira-mcp <command> --help` | Show help for a specific command |

---

## Config commands

All `config` subcommands read and write `~/.softspark/jira-mcp/config.json` and `credentials.json`.

### `config init`

Create the global config directory with skeleton files. Safe to run multiple times — existing files are never overwritten.

```bash
jira-mcp config init
```

Creates:

```
~/.softspark/jira-mcp/
  config.json
  credentials.json
  state.json
  cache/
  templates/tasks/
```

Output shows `+` for created items and `=` for skipped items.

---

### `config add-project`

Add a project key-to-URL mapping. The first project added becomes the default.

```bash
jira-mcp config add-project <KEY> <URL>
```

| Argument | Description |
|----------|-------------|
| `KEY` | Uppercase project key (letters and digits, starts with letter). Example: `PROJ`, `E8A` |
| `URL` | Jira instance URL, must start with `https://` |

```bash
# Add a project
jira-mcp config add-project PROJ https://my-org.atlassian.net

# Add a second project on a different instance
jira-mcp config add-project CLIENT https://client.atlassian.net
```

---

### `config remove-project`

Remove a project mapping from `config.json`.

```bash
jira-mcp config remove-project <KEY>
```

---

### `config list-projects`

Display all configured projects and which one is the default.

```bash
jira-mcp config list-projects
```

---

### `config set-credentials`

Write email and API token to `credentials.json`.

```bash
jira-mcp config set-credentials <EMAIL> <API_TOKEN>
```

```bash
jira-mcp config set-credentials user@example.com ATATT3xFfGF0...
```

The credentials file is stored at `~/.softspark/jira-mcp/credentials.json`. Never commit this file to version control.

---

### `config set-default`

Set the default project key. The default project is used by commands and tools that operate without an explicit project argument.

```bash
jira-mcp config set-default <KEY>
```

| Argument | Description |
|----------|-------------|
| `KEY` | An existing project key already present in `config.json` |

```bash
jira-mcp config set-default PROJ
```

---

### `config set-language`

Set the global default language for task titles and descriptions produced by bulk-create commands.

```bash
jira-mcp config set-language <lang>
```

| Argument | Description |
|----------|-------------|
| `lang` | Language code: `pl`, `en`, `de`, `es`, `fr`, `pt`, `it`, `nl` |

```bash
jira-mcp config set-language en
```

The global language can be overridden per project with `config set-project-language`.

---

### `config set-project-language`

Set a language override for a specific project. When set, this takes precedence over the global language configured with `config set-language`.

```bash
jira-mcp config set-project-language <KEY> <lang>
```

| Argument | Description |
|----------|-------------|
| `KEY` | An existing project key already present in `config.json` |
| `lang` | Language code: `pl`, `en`, `de`, `es`, `fr`, `pt`, `it`, `nl` |

```bash
jira-mcp config set-project-language CLIENT en
jira-mcp config set-project-language PROJ pl
```

---

## Cache commands

Cache commands populate local JSON files under `~/.softspark/jira-mcp/cache/`.

### `cache sync-workflows`

Fetch workflow status definitions for every configured project and write them to `~/.softspark/jira-mcp/cache/workflows.json`.

```bash
jira-mcp cache sync-workflows
```

Run this after:
- Adding a new project
- Workflows change in Jira (new statuses, transitions)

---

### `cache sync-users`

Fetch users from every unique Jira instance and write them to `~/.softspark/jira-mcp/cache/users.json`. Results are deduplicated by instance URL.

```bash
jira-mcp cache sync-users
```

Run this when:
- Team members join or leave
- `reassign_task` cannot resolve a user by email

---

### `cache list-workflows`

Print cached workflow statuses.

```bash
jira-mcp cache list-workflows
```

---

### `cache list-users`

Print cached users.

```bash
jira-mcp cache list-users
```

---

## Task creation commands

### `create`

Create tasks from a bulk configuration JSON file. Runs in **dry-run mode by default** — no Jira tasks are created until `--execute` is passed.

```bash
jira-mcp create <config-path> [--execute]
```

| Option | Description |
|--------|-------------|
| `--execute` | Execute for real (default is dry-run) |

Config path resolution order:
1. Exact path if it ends with `.json` and exists
2. Input with `.json` appended (relative to `cwd`)
3. `~/.softspark/jira-mcp/templates/tasks/<input>.json`

```bash
# Dry-run preview
jira-mcp create sprint-tasks.json

# Actually create tasks
jira-mcp create sprint-tasks.json --execute

# Use a named template from ~/.softspark/jira-mcp/templates/tasks/
jira-mcp create onboarding --execute
```

---

### `create-monthly`

Scan `~/.softspark/jira-mcp/templates/tasks/` for subdirectories containing `monthly_admin.json` and run each one. Runs in **dry-run mode by default**.

```bash
jira-mcp create-monthly [--execute] [--project <KEY>]
```

| Option | Description |
|--------|-------------|
| `--execute` | Execute for real (default is dry-run) |
| `--project <KEY>` | Filter to a single project subdirectory (case-insensitive) |

Expected directory structure:

```
~/.softspark/jira-mcp/templates/tasks/
  biel/
    monthly_admin.json
  e8a/
    monthly_admin.json
```

```bash
# Preview all monthly configs
jira-mcp create-monthly

# Execute for a single project
jira-mcp create-monthly --project E8A --execute

# Execute all
jira-mcp create-monthly --execute
```

---

## Server command

### `serve`

Start the MCP server explicitly (equivalent to running `jira-mcp` with no subcommand).

```bash
jira-mcp serve
```

The server communicates over stdio using the Model Context Protocol. It is normally started by your MCP client (e.g. Claude Code), not invoked directly.

---

## Environment variable overrides

All path resolution can be overridden with environment variables, bypassing the default `~/.softspark/jira-mcp/` location:

| Variable | Default | Purpose |
|----------|---------|---------|
| `JIRA_CONFIG_PATH` | `~/.softspark/jira-mcp/config.json` | Path to `config.json` |
| `JIRA_CREDENTIALS_PATH` | `~/.softspark/jira-mcp/credentials.json` | Path to `credentials.json` |

Path resolution order (highest priority first):

1. CLI `--config` / `--credentials` options (where applicable)
2. `JIRA_CONFIG_PATH` / `JIRA_CREDENTIALS_PATH` environment variables
3. `config.json` / `credentials.json` in the current working directory
4. `~/.softspark/jira-mcp/` global fallback

---

## Common workflows

**Initial setup:**

```bash
jira-mcp config init
jira-mcp config set-credentials me@company.com MY_TOKEN
jira-mcp config add-project PROJ https://company.atlassian.net
jira-mcp cache sync-workflows
jira-mcp cache sync-users
```

**Add a new project and refresh caches:**

```bash
jira-mcp config add-project NEWPROJ https://company.atlassian.net
jira-mcp cache sync-workflows
```

**Preview then execute a bulk creation:**

```bash
jira-mcp create tasks/sprint-42.json
# Review output, then:
jira-mcp create tasks/sprint-42.json --execute
```

## Related Documentation

- [Setup guide](../howto/setup.md)
- [Multi-instance configuration](../howto/multi-instance.md)
- [Common issues](../troubleshooting/common-issues.md)
