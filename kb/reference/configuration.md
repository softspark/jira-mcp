---
title: "Jira MCP Server - Configuration Reference"
category: reference
service: jira-mcp
tags: [configuration, config, credentials, multi-instance, environment-variables]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Full reference for config.json, credentials.json, path resolution order, environment variables, and multi-instance setup."
---

# Jira MCP Server - Configuration Reference

## Configuration Files

The server requires two JSON files: `config.json` (project definitions) and `credentials.json` (authentication).

### config.json

```json
{
  "projects": {
    "DEVOPS": { "url": "https://devops.atlassian.net", "language": "en" },
    "ADMIN": { "url": "https://admin.atlassian.net" }
  },
  "default_project": "DEVOPS",
  "default_language": "pl"
}
```

In this example `DEVOPS` uses `"en"` and `ADMIN` inherits `"pl"` from `default_language`.

**Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projects` | object | Yes | Map of project key to instance config. |
| `projects.<KEY>.url` | string (URL) | Yes | Jira Cloud base URL for this project. |
| `projects.<KEY>.language` | `LanguageCode` | No | Language override for this project. Overrides `default_language`. |
| `default_project` | string | Yes | Must reference a key present in `projects`. |
| `default_language` | `LanguageCode` | No | Global language default. Applied to any project that has no `language` field. Defaults to `"pl"` when omitted. |

**`LanguageCode` enum values:** `pl`, `en`, `de`, `es`, `fr`, `pt`, `it`, `nl`.

**Language resolution order (first match wins):**
1. `projects.<KEY>.language` — per-project override.
2. `default_language` — global default from `config.json`.
3. `"pl"` — hardcoded fallback when neither field is set.

**Constraints (enforced by Zod):**
- `url` must be a valid URL string.
- `default_project` must match a key in `projects`.
- `language` and `default_language`, when present, must be one of the `LanguageCode` enum values.

### credentials.json

```json
{
  "username": "user@example.com",
  "api_token": "your-api-token-here"
}
```

**Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string (email) | Yes | Jira account email address. |
| `api_token` | string | Yes | Jira API token (non-empty). |

**Credentials apply to all configured projects by default.** For per-instance credentials, see the per-instance format below.

---

## Path Resolution Order

The loader checks locations in the following priority order (first match wins):

| Priority | Source | Config path | Credentials path |
|----------|--------|-------------|-----------------|
| 1 | Explicit option (programmatic) | `options.configPath` | `options.credentialsPath` |
| 2 | Environment variable | `$JIRA_CONFIG_PATH` | `$JIRA_CREDENTIALS_PATH` |
| 3 | Local file (cwd) | `<cwd>/config.json` (if exists) | `<cwd>/credentials.json` (if exists) |
| 4 | Global fallback | `~/.softspark/jira-mcp/config.json` | `~/.softspark/jira-mcp/credentials.json` |

The local file check is presence-based: if the file does not exist at `cwd`, resolution falls through to the global path.

---

## Global Configuration Directory

All persistent server state lives under `~/.softspark/jira-mcp/`:

```
~/.softspark/jira-mcp/
├── config.json              # Project definitions
├── credentials.json         # Jira credentials
├── state.json               # Runtime state
├── cache/
│   ├── workflows.json       # Cached workflow statuses per project
│   └── users.json           # Cached user directory per instance
└── templates/
    └── tasks/               # User-defined task templates (BulkConfig JSON)
```

The directory tree is created automatically on first use via `ensureGlobalDirs()`.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JIRA_CONFIG_PATH` | Absolute path to `config.json`. | `/etc/jira-mcp/config.json` |
| `JIRA_CREDENTIALS_PATH` | Absolute path to `credentials.json`. | `/run/secrets/jira-credentials.json` |

Setting these variables overrides both local and global file discovery.

---

## Language Configuration

### CLI Commands

| Command | Description |
|---------|-------------|
| `jira-mcp config set-language <lang>` | Set the global `default_language` in `config.json`. |
| `jira-mcp config set-project-language <key> <lang>` | Set the `language` field for a specific project entry. |

`<lang>` must be a valid `LanguageCode`: `pl`, `en`, `de`, `es`, `fr`, `pt`, `it`, `nl`.

### Resolution Order (recap)

1. `projects.<KEY>.language` — set via `config set-project-language`.
2. `default_language` — set via `config set-language`.
3. `"pl"` — hardcoded fallback when neither field is present.

---

## Multi-Instance Configuration Example

Multiple project keys can point to different Jira Cloud instances. Credentials are shared across all instances in a single deployment.

```json
{
  "projects": {
    "MOBILE": {
      "url": "https://company-mobile.atlassian.net"
    },
    "BACKEND": {
      "url": "https://company-backend.atlassian.net"
    },
    "INFRA": {
      "url": "https://company-backend.atlassian.net"
    }
  },
  "default_project": "BACKEND"
}
```

In this configuration:
- `MOBILE` uses one Jira instance.
- `BACKEND` and `INFRA` share a second Jira instance.
- `InstancePool` deduplicates: only two `JiraConnector` instances are created.
- `sync_tasks` without `project_key` queries both unique URLs exactly once.

---

## Runtime Merged Config

After loading, credentials are merged into each project entry to produce the runtime `JiraConfig` type:

```typescript
{
  projects: {
    "PROJ": {
      url: "https://your-org.atlassian.net",
      username: "user@example.com",
      api_token: "..."
    }
  },
  default_project: "PROJ",
  credentials: {
    username: "user@example.com",
    api_token: "..."
  }
}
```

This merged object is what `InstancePool` and `TaskSyncer` receive at startup.

---

## Obtaining a Jira API Token

1. Log in to [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**.
3. Copy the token and paste it into `credentials.json` as `api_token`.

The `username` must be the email address associated with the Atlassian account.

---

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Caching](./caching.md)
- [API Reference](./api.md)
