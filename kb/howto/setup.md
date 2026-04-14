---
title: "How to Set Up Jira MCP Server"
category: howto
service: jira-mcp
tags: [setup, install, configuration, quickstart]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Quick start guide for installing and configuring the Jira MCP server."
---

# How to Set Up Jira MCP Server

## Prerequisites

- Node.js >= 18.0.0
- A Jira Cloud account with project access
- An MCP-compatible client (e.g. Claude Code)

## Steps

### 1. Install the package

Global install (recommended):

```bash
npm install -g @softspark/jira-mcp
```

Or run without installing:

```bash
npx @softspark/jira-mcp
```

Verify the binary is available:

```bash
jira-mcp --version
# 1.0.0
```

### 2. Generate a Jira API token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**.
3. Give it a label (e.g. `jira-mcp`) and copy the token immediately — it is shown only once.

### 3. Initialize the config directory

```bash
jira-mcp config init
```

This creates the directory tree under `~/.softspark/jira-mcp/` with skeleton files:

```
~/.softspark/jira-mcp/
  config.json          # project-to-URL mappings (no secrets)
  credentials.json     # email + API token (keep private)
  state.json           # runtime state
  cache/               # workflow and user caches
  templates/tasks/     # bulk task templates
```

Safe to re-run — existing files are never overwritten.

### 4. Set credentials

```bash
jira-mcp config set-credentials your@email.com YOUR_API_TOKEN
```

This writes to `~/.softspark/jira-mcp/credentials.json`. Never commit this file.

### 5. Add a project

```bash
jira-mcp config add-project PROJ https://your-org.atlassian.net
```

Rules for project keys:
- Uppercase letters and digits only
- Must start with a letter
- Examples: `PROJ`, `E8A`, `TEAM2`

The first project added automatically becomes the default project.

Add more projects as needed:

```bash
jira-mcp config add-project TEAM https://another-org.atlassian.net
```

### 6. Verify configuration

```bash
jira-mcp config list-projects
```

Expected output:

```
Projects:
  PROJ -> https://your-org.atlassian.net (default)
  TEAM -> https://another-org.atlassian.net
```

### 7. Configure your MCP client

For Claude Code, add to `~/.claude/claude_desktop_config.json` or a project-level config:

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

No `env` block is needed. Configuration is loaded automatically from `~/.softspark/jira-mcp/` after running `jira-mcp config init`.

### 8. First use

In your MCP client, run the tools in this order:

1. Sync tasks from Jira into the local cache:

```
sync_tasks(jql="assignee=currentUser() AND status!=Done")
```

2. Read cached tasks offline (no Jira API call):

```
read_cached_tasks()
```

The cache persists between sessions so subsequent reads are instant.

## Verification

```bash
# Config file should list your project(s)
cat ~/.softspark/jira-mcp/config.json

# Credentials file should have your email (token is opaque)
cat ~/.softspark/jira-mcp/credentials.json
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `command not found: jira-mcp` | Run `npm install -g @softspark/jira-mcp` or use `npx` prefix |
| `ConfigNotFoundError` | Run `jira-mcp config init` first |
| `JiraAuthenticationError` (401) | Verify email and API token with `config set-credentials` |
| Tasks not appearing | Run `sync_tasks` — the cache may be empty or stale |

## Related Documentation

- [Multi-instance setup](../howto/multi-instance.md)
- [CLI reference](../howto/cli-usage.md)
- [Common issues](../troubleshooting/common-issues.md)
