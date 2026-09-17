---
title: "Jira MCP Server - Configuration Reference"
category: reference
service: jira-mcp
tags: [configuration, config, credentials, multi-instance, environment-variables, tempo]
version: "1.15.0"
created: "2026-04-13"
last_updated: "2026-09-17"
description: "Full reference for config.json, credentials.json, the Tempo token, path resolution order, environment variables, and multi-instance setup."
---

# Jira MCP Server - Configuration Reference

## Configuration Files

The server requires two JSON files: `config.json` (project definitions) and `credentials.json` (authentication).

New configuration/cache directories use mode 0700; credentials and state files
use 0600. Initialization preserves existing files and directory permissions.
Use `jira-mcp audit --json` to inspect modes, owners and unsafe file types
without reading credential contents. See the [audit reference](audit.md).

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
| `tempo_api_url` | string (URL) | No | Tempo Cloud REST API base URL, version segment included. Defaults to `https://api.tempo.io/4`. Sites pinned to a Tempo region use `https://api.eu.tempo.io/4` or `https://api.us.tempo.io/4`. |

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

Two formats are supported. The loader auto-detects which is in use.

**Format A (legacy) — single credential for all instances:**

```json
{
  "username": "user@example.com",
  "api_token": "your-api-token-here"
}
```

**Format B (recommended) — per-instance credentials with default fallback:**

```json
{
  "default": {
    "username": "user@example.com",
    "api_token": "default-token"
  },
  "instances": {
    "https://other.atlassian.net": {
      "username": "other@example.com",
      "api_token": "other-token"
    }
  }
}
```

**Fields (Format B)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `default` | object | Yes | Default credential used for instances without a specific override. |
| `default.username` | string (email) | Yes | Jira account email address. |
| `default.api_token` | string | Yes | Jira API token (non-empty). |
| `default.tempo_token` | string | No | Tempo API token for the site the default credential serves. |
| `instances` | object | No | Map of Jira instance URL → credential override. |
| `instances.<URL>.username` | string (email) | Yes | Instance-specific email. |
| `instances.<URL>.api_token` | string | Yes | Instance-specific API token. |
| `instances.<URL>.tempo_token` | string | No | Tempo API token for that instance. Never inherited from `default`. |

**Credential resolution order:** `instances[project.url]` → `default`. The Tempo token travels with whichever entry wins and is not borrowed from `default` by an instance override: a Tempo token is bound to one site, and the wrong one only produces a confusing 401.

Format A accepts `tempo_token` as a third top-level field.

**CLI commands:**

```bash
# Set default credentials (all instances without override)
jira-mcp config set-credentials user@example.com --token TOKEN

# Set credentials for a specific Jira instance
jira-mcp config set-credentials other@example.com --token TOKEN --url https://other.atlassian.net

# Store the Tempo token on the default credential, or on one instance
jira-mcp config set-tempo-token --token TEMPO_TOKEN
jira-mcp config set-tempo-token --token TEMPO_TOKEN --url https://other.atlassian.net
```

The CLI automatically migrates Format A → Format B on first use of `--url`. `set-credentials` keeps a stored `tempo_token` when the Jira token in the same slot is rotated, and `set-tempo-token --url` creates the instance entry from `default` when none exists yet.

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

**Security note:** When a config or credentials file is loaded from `cwd` instead of the global directory, a warning is logged to stderr. This guards against running the server from an untrusted directory (e.g., a cloned repository) where a malicious `config.json` or `credentials.json` could redirect requests to an attacker-controlled Jira instance.

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
    ├── comments/            # User-defined comment template overrides (.md)
    ├── task-templates/      # User-defined create_task template overrides (.md)
    └── tasks/               # User-defined bulk task templates (BulkConfig JSON)
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

Multiple project keys can point to different Jira Cloud instances. Use per-instance credentials (Format B) when instances require different accounts.

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
      api_token: "...",
      tempo_token: "..."        // only when the winning credential has one
    }
  },
  default_project: "PROJ",
  credentials: {
    username: "user@example.com",
    api_token: "..."
  },
  tempo_api_url: "https://api.tempo.io/4"
}
```

This merged object is what `InstancePool` and `TaskSyncer` receive at startup. `InstancePool.getTempoClient(projectKey)` builds a Tempo client lazily from the project's `tempo_token` and the shared `tempo_api_url`, and throws `TempoNotConfiguredError` (`TEMPO_NOT_CONFIGURED`) for a site without a token.

---

## Obtaining a Jira API Token

1. Log in to [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**.
3. Copy the token and paste it into `credentials.json` as `api_token`.

The `username` must be the email address associated with the Atlassian account.

---

## Obtaining a Tempo API Token

Tempo is a Marketplace app with its own token store; the Jira token never reaches it.

1. In Jira open **Tempo > Settings > API Integration** (requires Tempo administrator rights, or a Tempo admin can issue one for you).
2. Click **New Token**, name it, pick an expiry and grant at least the **View worklogs** scope. To report on other people's time the token owner also needs Tempo's "View all worklogs" permission.
3. Copy the token and store it with `jira-mcp config set-tempo-token --token <TOKEN>`.

Tempo tokens are issued per Jira site. A multi-site install stores one per instance with `--url`.

---

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Caching](./caching.md)
- [API Reference](./api.md)
