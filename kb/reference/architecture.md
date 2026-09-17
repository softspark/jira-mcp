---
title: "Jira MCP Server - Architecture Overview"
category: reference
service: jira-mcp
tags: [architecture, mcp, jira, tempo, typescript, design-patterns]
version: "1.15.0"
created: "2026-04-13"
last_updated: "2026-09-17"
description: "System architecture, module layout, data flow, and key design patterns for the Jira MCP server."
---

# Jira MCP Server - Architecture Overview

## System Overview

The Jira MCP server exposes Jira operations as MCP (Model Context Protocol) tools, allowing AI assistants to interact with Jira via a stdio transport. It also ships a CLI (`jira-mcp`) for configuration management and cache maintenance.

**Two entry points:**

| Entry Point | Purpose |
|-------------|---------|
| `src/server.ts` | MCP server — registers all MCP tools, communicates over stdio |
| `src/cli.ts` | CLI — `config`, `cache` subcommand groups |

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ESM) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Jira client | Built-in `fetch` (Jira REST API v3) |
| Tempo client | Same transport, Bearer token (Tempo Cloud REST API v4) |
| Schema validation | Zod |
| Markdown -> ADF | Built-in (zero-dependency) |
| ADF -> Markdown | Built-in (zero-dependency) |
| Transport | stdio (MCP standard) |
| Cache format | JSON with atomic writes |

## Module Architecture

```
src/
├── server.ts              # MCP server entry point
├── cli.ts                 # CLI entry point
├── version.ts             # Package version injected at build time
│
├── config/
│   ├── schema.ts          # Zod schemas: ConfigFile, Credentials, JiraConfig
│   ├── loader.ts          # loadConfig(), getProjectConfig(), getUniqueInstances()
│   └── paths.ts           # Global path constants (~/.softspark/jira-mcp/)
│
├── connector/
│   ├── jira-connector.ts  # JiraConnector using built-in fetch (REST API v3)
│   ├── tempo-client.ts    # TempoClient: Bearer auth, worklog pagination (Tempo v4)
│   ├── tempo-types.ts     # TempoWorklog, TempoWorklogQuery
│   ├── instance-pool.ts   # InstancePool: deduplicates connectors and Tempo clients by URL
│   ├── time-parser.ts     # parseTimeSpent("2h 30m") <-> formatTimeSpent(seconds)
│   └── types.ts           # JiraIssue, JiraIssueDetail, JiraIssueRef, JiraProject, ...
│
├── cache/
│   ├── manager.ts         # CacheManager: CRUD + atomic writes for tasks
│   ├── syncer.ts          # TaskSyncer: fetches from Jira, writes to cache
│   ├── workflow-cache.ts  # WorkflowCacheManager: project statuses per issue type
│   ├── user-cache.ts      # UserCacheManager: email -> accountId resolution
│   ├── types.ts           # TaskData, CacheData (Zod schemas)
│   ├── workflow-types.ts  # WorkflowCacheData (Zod schemas)
│   └── user-types.ts      # UserCacheData, CachedUser (Zod schemas)
│
├── adf/
│   ├── markdown-to-adf.ts # markdownToAdf() built-in parser + fallback
│   ├── adf-to-markdown.ts # adfToMarkdown() built-in converter + fallback
│   ├── builder.ts         # createTextDoc(), wrapInPanel(), createHeading(), ...
│   └── types.ts           # AdfDocument, AdfNode, AdfMark interfaces
│
├── operations/
│   ├── task-operations.ts  # TaskOperations: status, comment, assign, time log
│   └── tempo-operations.ts # TempoOperations: Tempo worklogs joined with Jira, reports
│
├── templates/
│   ├── built-in.ts        # Built-in CommentTemplates
│   ├── registry.ts        # TemplateRegistry: get, list, override built-ins
│   ├── renderer.ts        # renderTemplate(): {{var}}, {{#var}}...{{/var}}
│   └── types.ts           # CommentTemplate, TemplateVariable interfaces
│
├── bulk/
│   ├── bulk-task-creator.ts  # BulkTaskCreator: batch create/update under epic
│   ├── placeholder.ts        # {MONTH}/{YEAR}/{DATE} replacement
│   ├── schema.ts             # Zod schemas for BulkConfig
│   └── types.ts              # BulkConfig, TaskConfig, BulkResult interfaces
│
├── errors/
│   └── index.ts           # JiraMcpError hierarchy
│
└── tools/
    ├── sync-tasks.ts
    ├── read-cached-tasks.ts
    ├── update-task-status.ts
    ├── add-task-comment.ts
    ├── reassign-task.ts
    ├── get-task-statuses.ts
    ├── get-task-details.ts
    ├── log-task-time.ts
    ├── get-task-time-tracking.ts
    ├── list-comment-templates.ts
    ├── add-templated-comment.ts
    ├── create-task.ts
    ├── search-tasks.ts
    ├── update-task.ts
    ├── get-project-language.ts
    ├── search-tempo-worklogs.ts
    └── get-tempo-report.ts
```

## Layer Diagram

```
┌─────────────────────────────────────────────┐
│                 MCP Client                  │
│            (AI assistant / IDE)             │
└─────────────────┬───────────────────────────┘
                  │ stdio (JSON-RPC)
┌─────────────────▼───────────────────────────┐
│              server.ts                      │
│  ListToolsRequestSchema / CallToolRequestSchema │
└──────┬──────────────────────────┬───────────┘
       │                          │
┌──────▼───────┐          ┌───────▼──────────┐
│    tools/    │          │    templates/    │
│  (handlers)   │         │   registry.ts    │
└──────┬───────┘          └───────┬──────────┘
       │                          │
┌──────▼───────────────────────────▼──────────┐
│           operations/task-operations.ts      │
│    changeStatus | addComment | reassign      │
│    getTaskDetails | logTime | getTimeTracking│
└──────┬───────────────────────┬──────────────┘
       │                       │
┌──────▼──────┐        ┌───────▼──────────────┐
│  connector/ │        │       cache/         │
│  JiraConnector│      │   CacheManager       │
│  InstancePool│       │   TaskSyncer         │
└──────┬───────┘       └───────┬──────────────┘
       │                       │
┌──────▼──────┐        ┌───────▼──────────────┐
│  Jira REST  │        │   .local/            │
│  API (v3)   │        │   tasks_<user>.json  │
└─────────────┘        └──────────────────────┘
```

## Data Flow: MCP Request to Jira API

```
1. MCP client calls tool (e.g. update_task_status)
2. server.ts CallToolRequestSchema handler extracts + validates args
3. Dispatches to handleUpdateTaskStatus(args, { pool, cacheManager })
4. Tool handler constructs TaskOperations(connector, cacheManager)
5. TaskOperations.changeStatus():
   a. connector.getTransitions(taskKey)   -> Jira REST GET /transitions
   b. connector.doTransition(taskKey, id) -> Jira REST POST /transitions
   c. cacheManager.updateTask(taskKey, { status }) -> atomic JSON write
6. Tool handler formats result as MCP content response
7. server.ts returns { content: [{ type: "text", text: "..." }] }
```

## Data Flow: Tempo Report

```
1. MCP client calls get_tempo_report({ from, to, project_key, group_by })
2. server.ts extracts args; group_by accepts an array or "user,task"
3. helpers.resolveTempoProjectKey() picks the routing project
   (project_key, else task_key prefix, else default_project)
4. pool.getTempoClient(projectKey)  -> TempoNotConfiguredError if no tempo_token
   pool.getConnector(projectKey)    -> the same site's JiraConnector
5. TempoOperations.report():
   a. jira.getProject(key)                    -> numeric projectId
   b. tempo.getWorklogs({ from, to, projectIds }) -> GET /4/worklogs, paginated
   c. jira.getIssuesByIdsOrKeys(issueIds)     -> POST issue/bulkfetch (100 per call)
      jira.getUsersByAccountIds(accountIds)   -> GET user/bulk (100 per call)
   d. aggregate by group_by, sort largest first
6. Tool handler flattens rows to snake_case and returns the envelope
```

Tempo is asked with ids and answers with ids; every key or name in the response comes from step 5c. A user filter routes step 5b to `worklogs/user/{accountId}`, which takes no other filter, so project and task filters are applied again after 5c.

## Key Design Patterns

### InstancePool — Connector Deduplication

Multiple project keys may share the same Jira URL. `InstancePool` creates exactly one `JiraConnector` (one fetch-based client) per unique URL, then maps every project key to the shared connector.

```
{ "PROJ-A": { url: "https://x.atlassian.net" },
  "PROJ-B": { url: "https://x.atlassian.net" } }
  -> one JiraConnector for https://x.atlassian.net
```

`getConnectorForTask("PROJ-A-123")` extracts `"PROJ-A"` prefix and resolves the connector.

### Atomic Cache Writes

All cache writes use a write-then-rename pattern with restrictive permissions to prevent readers from seeing partially written files and to protect cached data on shared machines:

```
writeFile(path + ".tmp", json, { encoding: "utf-8", mode: 0o600 })
rename(path + ".tmp", path)
```

This applies to: task cache (`CacheManager`), workflow cache (`WorkflowCacheManager`), and user cache (`UserCacheManager`).

### ADF Conversion with Safe Fallbacks

Both conversion directions never throw to callers:

- `markdownToAdf(md)`: on failure, wraps raw text in a minimal ADF paragraph
- `adfToMarkdown(adf)`: `null` returns `"(No content)"`, on failure returns `"[ADF conversion failed]\n\n<raw JSON>"`

### Dependency Injection via Fetcher Adapter

`TaskSyncer` depends on `JiraFetcher` (interface), not `JiraConnector`. `server.ts` provides a `createFetcherAdapter(connector)` that bridges the flat issue shape from `JiraConnector` to the nested `fields` shape the syncer expects. This decouples the sync layer from the HTTP client.

### Error Hierarchy

All errors extend `JiraMcpError` and carry a machine-readable `code` string alongside the human-readable `message`. See [errors reference](../reference/architecture.md#error-hierarchy) and `src/errors/index.ts` for the full tree.

## Error Hierarchy

```
JiraMcpError (code: string)
├── ConfigError (CONFIG_ERROR)
│   ├── ConfigNotFoundError (CONFIG_NOT_FOUND)
│   ├── ConfigValidationError (CONFIG_VALIDATION)
│   └── TempoNotConfiguredError (TEMPO_NOT_CONFIGURED)
├── JiraConnectionError (JIRA_CONNECTION)
│   ├── JiraAuthenticationError (JIRA_AUTH)
│   └── JiraPermissionError (JIRA_PERMISSION)
├── TempoConnectionError (TEMPO_CONNECTION)
│   ├── TempoAuthenticationError (TEMPO_AUTH)
│   └── TempoPermissionError (TEMPO_PERMISSION)
├── CacheError (CACHE_ERROR)
│   ├── CacheNotFoundError (CACHE_NOT_FOUND)
│   ├── CacheCorruptionError (CACHE_CORRUPTION)
│   └── TaskNotFoundError (TASK_NOT_FOUND)
├── TemplateError (TEMPLATE_ERROR)
│   ├── TemplateNotFoundError (TEMPLATE_NOT_FOUND)
│   └── TemplateMissingVariableError (TEMPLATE_MISSING_VAR)
└── AdfConversionError (ADF_CONVERSION)
```

## Related Documentation

- [API Reference](./api.md)
- [Configuration Reference](./configuration.md)
- [ADF Conversion](./adf.md)
- [Caching](./caching.md)
- [Comment Templates](./templates.md)
