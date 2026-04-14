---
title: "Jira MCP Server - Caching Reference"
category: reference
service: jira-mcp
tags: [cache, storage, sync, workflow, users, tasks]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Reference for the three cache subsystems: task cache, workflow cache, and user cache — including formats, file paths, atomic writes, and invalidation strategies."
---

# Jira MCP Server - Caching Reference

## Overview

The server maintains three independent JSON caches to enable offline reads and reduce API calls:

| Cache | File | Manager class | Purpose |
|-------|------|---------------|---------|
| Task cache | `.local/tasks_<user>.json` | `CacheManager` | Cached Jira tasks per user |
| Workflow cache | `~/.softspark/jira-mcp/cache/workflows.json` | `WorkflowCacheManager` | Project statuses per issue type |
| User cache | `~/.softspark/jira-mcp/cache/users.json` | `UserCacheManager` | User directory for email -> accountId lookup |

All three caches use **atomic writes** (write to `.tmp` then rename) to prevent readers from seeing partially-written files.

---

## Task Cache

### Location

```
<cwd>/.local/tasks_<sanitized-email>.json
```

The email is sanitized by replacing `@` with `_at_` and `.` with `_`:

```
user@example.com  ->  tasks_user_at_example_com.json
```

### Format

```json
{
  "metadata": {
    "version": "1.0",
    "last_sync": "2026-04-13T10:00:00.000Z",
    "jira_user": "user@example.com"
  },
  "tasks": [
    {
      "key": "PROJ-123",
      "summary": "Implement login page",
      "status": "In Progress",
      "assignee": "user@example.com",
      "priority": "High",
      "issue_type": "Story",
      "created": "2026-03-01T10:00:00.000Z",
      "updated": "2026-04-10T14:30:00.000Z",
      "project_key": "PROJ",
      "project_url": "https://example.atlassian.net",
      "epic_link": "PROJ-100"
    }
  ]
}
```

**TaskData fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `key` | string | No | Issue key (e.g. `"PROJ-123"`) |
| `summary` | string | No | Issue title |
| `status` | string | No | Current status name |
| `assignee` | string | Yes | Assignee email, or `null` if unassigned |
| `priority` | string | No | Priority name |
| `issue_type` | string | No | Issue type name |
| `created` | string | No | ISO timestamp |
| `updated` | string | No | ISO timestamp |
| `project_key` | string | No | Project key prefix |
| `project_url` | string (URL) | No | Jira instance base URL |
| `epic_link` | string | Yes | Epic key, or `null` if not linked |

### CRUD Operations

| Method | Description |
|--------|-------------|
| `initialize()` | Creates directory + empty cache file if absent; validates existing cache on startup |
| `load()` | Reads, JSON-parses, and Zod-validates the cache file |
| `save(tasks)` | Validates + atomically writes the full task array |
| `getTask(key)` | Returns single task or throws `TaskNotFoundError` |
| `getAllTasks()` | Returns all cached tasks |
| `updateTask(key, updates)` | Applies partial update, sets `updated` to now, atomically writes |
| `deleteTask(key)` | Removes task from array, atomically writes |
| `getMetadata()` | Returns `{ version, last_sync, jira_user }` |

### Atomic Write Pattern

```
writeFile(cachePath + ".tmp", json)
rename(cachePath + ".tmp", cachePath)
```

This ensures readers always see a complete file. If the process is interrupted mid-write, the `.tmp` file is left behind but the main cache file is intact.

### Validation on Load

Every `load()` call:
1. Parses JSON
2. Runs Zod schema validation (`CacheDataSchema`)
3. Checks `metadata.version === "1.0"`

If any step fails, a `CacheCorruptionError` is thrown.

---

## Workflow Cache

### Location

```
~/.softspark/jira-mcp/cache/workflows.json
```

### Format

```json
{
  "last_sync": "2026-04-13T10:00:00.000Z",
  "projects": {
    "PROJ": {
      "issue_types": {
        "Story": {
          "statuses": ["To Do", "In Progress", "In Review", "Done"],
          "transitions": {}
        },
        "Bug": {
          "statuses": ["To Do", "In Progress", "Done"],
          "transitions": {}
        }
      }
    }
  }
}
```

### Sync Logic

`WorkflowCacheManager.syncProject(projectKey, connector)`:
1. Calls `connector.getProjectStatuses(projectKey)` — Jira REST `GET /project/{key}/statuses`
2. Builds `{ issue_types: { <name>: { statuses: [...], transitions: {} } } }`
3. Merges into existing data (incremental update, does not clear other projects)
4. Atomically writes

`syncAll(pool, config)` iterates all configured project keys.

### Lookup

```typescript
workflowCache.getProjectWorkflow("PROJ")
// Returns ProjectWorkflow | null
// null means project not yet synced
```

---

## User Cache

### Location

```
~/.softspark/jira-mcp/cache/users.json
```

### Format

```json
{
  "last_sync": "2026-04-13T10:00:00.000Z",
  "instances": {
    "https://example.atlassian.net": {
      "users": [
        {
          "account_id": "5b10ac8d82e05b22cc7d4ef5",
          "email": "user@example.com",
          "display_name": "John Doe",
          "active": true
        }
      ]
    }
  }
}
```

**CachedUser fields:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `account_id` | string | No | Jira account ID (used for assignment) |
| `email` | string | Yes | Email address, or `null` for service accounts |
| `display_name` | string | No | Display name |
| `active` | boolean | No | Whether the account is active |

### Sync Logic

`UserCacheManager.syncInstance(instanceUrl, connector)`:
1. Calls `connector.searchUsers("", 1000)` — fetches up to 1000 users with an empty query
2. Maps to `CachedUser` shape
3. Merges into existing data under the instance URL key
4. Atomically writes

`syncAll(pool)` iterates all unique instances via `pool.getInstances()`.

### Email Resolution

```typescript
userCache.resolveEmail("https://example.atlassian.net", "user@example.com")
// Returns accountId string | null
// Comparison is case-insensitive
```

Used internally by `reassign_task` when looking up the assignee account ID.

---

## Cache Invalidation Strategies

| Event | Invalidation |
|-------|-------------|
| `sync_tasks` | Replaces entire task array with fresh data from Jira |
| `update_task_status` | `CacheManager.updateTask()` — updates `status` field in place |
| `reassign_task` | `CacheManager.updateTask()` — updates `assignee` field in place |
| `log_task_time` | `CacheManager.deleteTask()` — removes task entirely to force re-fetch |
| Cache file corrupt | `initialize()` throws `CacheCorruptionError`; manual delete + re-sync required |

The workflow and user caches are not automatically invalidated. Run `jira-mcp cache sync-workflows` or `jira-mcp cache sync-users` to refresh them.

---

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Configuration Reference](./configuration.md)
- [API Reference](./api.md)
