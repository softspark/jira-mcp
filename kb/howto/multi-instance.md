---
title: "How to Configure Multiple Jira Instances"
category: howto
service: jira-mcp
tags: [multi-instance, configuration, routing, instance-pool]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Configure and use projects across multiple Jira Cloud or Server instances from a single MCP server."
---

# How to Configure Multiple Jira Instances

Jira MCP supports any number of projects across different Jira instances. Each project key maps to one Jira URL, and the server routes API calls automatically.

## Prerequisites

- Jira MCP installed and initialized (see [setup guide](../howto/setup.md))
- API tokens valid for each Jira instance you want to connect

## Steps

### 1. Understand the credential model

**Format A (legacy):** A flat `credentials.json` with `{ username, api_token }`. Applies the same credential to all instances. Works when all instances share the same Atlassian account.

**Format B (recommended):** `credentials.json` with `{ default, instances }`. Each Jira instance URL can have its own credential, with a default fallback. Use this when different Jira instances require different API tokens.

```bash
# Set the default credential (used by all instances without an override)
jira-mcp config set-credentials shared@example.com --token SHARED_TOKEN

# Set a per-instance credential (overrides default for this URL only)
jira-mcp config set-credentials other@example.com --token OTHER_TOKEN --url https://client-org.atlassian.net
```

The CLI automatically migrates Format A → Format B on first use of `--url`. Existing credentials are preserved as the `default`.

### 2. Add projects from different instances

Each `add-project` call registers a project key pointing to a Jira URL:

```bash
# Instance A — your main org
jira-mcp config add-project PROJ https://main-org.atlassian.net

# Instance B — a client workspace
jira-mcp config add-project CLIENT https://client-org.atlassian.net

# Instance C — a partner workspace
jira-mcp config add-project PARTNER https://partner.atlassian.net
```

Multiple projects from the same instance share a single connector:

```bash
# Both map to the same URL — only one HTTP connection is created
jira-mcp config add-project ALPHA https://main-org.atlassian.net
jira-mcp config add-project BETA  https://main-org.atlassian.net
```

### 3. How InstancePool deduplicates by URL

When the server starts, `InstancePool` groups all configured project keys by URL. Projects sharing a URL share one fetch-based `JiraConnector`. This means:

- `ALPHA-1` and `BETA-5` both route through the single connector for `https://main-org.atlassian.net`
- `CLIENT-10` routes through a separate connector for `https://client-org.atlassian.net`

You never need to specify which instance to use — the task key prefix determines routing automatically.

### 4. How tasks are routed to the correct instance

Routing is based on the project key prefix of the task key:

| Task key | Extracted prefix | Routed to |
|----------|-----------------|-----------|
| `PROJ-42` | `PROJ` | `https://main-org.atlassian.net` |
| `CLIENT-7` | `CLIENT` | `https://client-org.atlassian.net` |
| `PARTNER-100` | `PARTNER` | `https://partner.atlassian.net` |

The MCP tool call is identical regardless of which instance the task lives on:

```
get_task_details(task_key="CLIENT-7")
update_task_status(task_key="PARTNER-100", status="In Review")
```

### 5. Example: three-instance setup

`~/.softspark/jira-mcp/config.json` after running the four `add-project` commands above:

```json
{
  "projects": {
    "PROJ":    { "url": "https://main-org.atlassian.net" },
    "ALPHA":   { "url": "https://main-org.atlassian.net" },
    "BETA":    { "url": "https://main-org.atlassian.net" },
    "CLIENT":  { "url": "https://client-org.atlassian.net" },
    "PARTNER": { "url": "https://partner.atlassian.net" }
  },
  "default_project": "PROJ"
}
```

At runtime the pool contains three connectors (one per unique URL), not five.

### 6. Sync behavior with multiple instances

`sync_tasks` without arguments syncs the default project. To sync across all instances in one call, use a broad JQL or call per project:

```
# Sync default project
sync_tasks()

# Sync a specific project on a different instance
sync_tasks(project_key="CLIENT")

# Sync all assigned tasks across the default instance
sync_tasks(jql="assignee=currentUser() AND status!=Done")
```

Cache sync commands operate across all instances at once:

```bash
# Syncs workflow statuses for every configured project (all instances)
jira-mcp cache sync-workflows

# Syncs users from every unique Jira instance
jira-mcp cache sync-users
```

## Verification

```bash
jira-mcp config list-projects
```

Confirm each project key maps to the correct URL. Then test a task fetch:

```
get_task_details(task_key="CLIENT-1")
```

If you receive a `ConfigValidationError: Project 'CLIENT' not found`, the project key was not added to `config.json`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Wrong instance used for a task | Verify `config.json` — check the URL for the project key prefix |
| `JiraAuthenticationError` on one instance only | That instance requires a different API token; set per-instance credentials: `jira-mcp config set-credentials email --token TOKEN --url https://instance.atlassian.net` |
| Tasks from instance B missing after sync | Run `sync_tasks(project_key="CLIENT")` explicitly |
| `ConfigValidationError: Project '...' not found` | Run `jira-mcp config add-project <KEY> <URL>` for the missing key |

## Related Documentation

- [Setup guide](../howto/setup.md)
- [CLI reference](../howto/cli-usage.md)
- [Common issues](../troubleshooting/common-issues.md)
