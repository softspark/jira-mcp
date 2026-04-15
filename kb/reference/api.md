---
title: "Jira MCP Server - API Reference"
category: reference
service: jira-mcp
tags: [api, mcp, tools, jira]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Complete reference for all MCP tools exposed by the Jira MCP server, including parameters, return values, and examples."
---

# Jira MCP Server - API Reference

All tools communicate over stdio using the MCP JSON-RPC protocol. Every tool returns `{ content: [{ type: "text", text: "..." }] }`.

## Task Management Tools (16)

### sync_tasks

Fetch tasks from Jira and write them to the local cache. Queries all configured instances unless scoped with `project_key`.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project_key` | string | No | — | Scope sync to a single project (e.g. `"PROJ"`). Omit to sync all instances. |
| `jql` | string | No | `assignee = "<user>" ORDER BY updated DESC` | Custom JQL query. |

**Input example**

```json
{
  "project_key": "PROJ",
  "jql": "assignee = currentUser() AND status != Done"
}
```

**Output example**

```
Synced 42 tasks from 2 Jira instances.
```

---

### read_cached_tasks

Read tasks from the local cache without hitting the Jira API. Returns all tasks or a single task when `task_key` is provided.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | No | — | Task key (e.g. `"PROJ-123"`). Omit to return all cached tasks. |

**Input example (single task)**

```json
{ "task_key": "PROJ-123" }
```

**Output example (single task)**

```json
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
```

---

### update_task_status

Change a task's status via a Jira workflow transition and update the local cache. Call `get_task_statuses` first to see valid transitions.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `status` | string | Yes | — | Target status name (case-insensitive, e.g. `"In Progress"`). |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "status": "In Progress"
}
```

**Output example**

```
Updated PROJ-123 status to "In Progress".
```

**Error:** If `status` is not a valid transition, returns available transitions in the error message.

---

### add_task_comment

Add a markdown comment to a Jira task. The markdown is automatically converted to ADF format before submission.

If you use ai-toolkit hooks, install [PATH: hooks/jira-mcp-hooks.json] to block this tool before execution until the user explicitly approves the exact comment preview.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `comment` | string | Yes | — | Comment text in markdown format. |
| `user_approved` | boolean | Yes | — | Must be `true` only after the user explicitly approves posting the comment. |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "comment": "## Update\n\nCompleted the login page implementation.\n\n- Added JWT support\n- Unit tests passing"
}
```

**Output example**

```
Added comment to PROJ-123 (comment ID: 10042).
```

---

### reassign_task

Reassign a task to a different user by email. Omit `assignee_email` or pass an empty string to unassign.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `assignee_email` | string | No | — | Email of the new assignee. Empty string or omit to unassign. |

**Input example (reassign)**

```json
{
  "task_key": "PROJ-123",
  "assignee_email": "jane@example.com"
}
```

**Input example (unassign)**

```json
{ "task_key": "PROJ-123" }
```

**Output example**

```
Reassigned PROJ-123 to jane@example.com.
```

---

### get_task_statuses

Get available workflow transitions for a task. Use this before `update_task_status` to see which status transitions are valid from the current state.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |

**Input example**

```json
{ "task_key": "PROJ-123" }
```

**Output example**

```
Available transitions for PROJ-123:
- To Do (id: 11)
- In Progress (id: 21)
- Done (id: 31)
```

---

### get_task_details

Get full task details from Jira, including description and all comments. ADF content is converted to markdown for readability.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |

**Input example**

```json
{ "task_key": "PROJ-123" }
```

**Output example**

```
PROJ-123: Implement login page
Status: In Progress | Type: Story | Priority: High
Assignee: user@example.com
Language: en

## Description
Implement the login page with JWT authentication.

## Comments (2)
[2026-04-01 by reviewer@example.com]
Looks good, please add refresh token support.

[2026-04-10 by user@example.com]
Added refresh token, ready for review.
```

**Note:** The response includes a `language` field containing the project's configured language (see `get_project_language`). AI assistants should use this value when writing content for the task.

---

### update_task

Update fields on an existing Jira issue. Only fields that are explicitly provided are changed; omitted fields are left untouched. The project instance is inferred from the `task_key` prefix.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `summary` | string | No | — | New issue summary / title. |
| `description` | string | No | — | New description in markdown format. Converted to ADF before submission. |
| `priority` | string | No | — | Priority name (e.g. `"High"`, `"Medium"`, `"Low"`). |
| `labels` | array of string | No | — | Replacement label list. Replaces all existing labels on the issue. |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "summary": "Implement login page with MFA support",
  "priority": "High",
  "labels": ["frontend", "security"]
}
```

**Output example**

```json
{
  "task_key": "PROJ-123",
  "updated_fields": ["summary", "priority", "labels"],
  "message": "Updated PROJ-123 successfully."
}
```

---

### get_project_language

Get the configured content language for a project. AI assistants should call this before writing task descriptions, comments, or any user-facing content to ensure the correct language is used.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project_key` | string | Yes | — | Project key (e.g. `"PROJ"`). |

**Input example**

```json
{ "project_key": "PROJ" }
```

**Output example**

```json
{
  "project_key": "PROJ",
  "language": "en",
  "source": "project",
  "message": "Project PROJ uses language: en (source: project)."
}
```

The `source` field indicates where the language setting comes from: `"project"` means it was set explicitly for this project, `"default"` means it falls back to the global default.

---

### log_task_time

Log work time to a Jira task. After logging, the task is removed from cache to force a refresh on next read. Days are not supported — use hours and minutes only.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `time_spent` | string | Yes | — | Time in format `"2h"`, `"30m"`, or `"2h 30m"`. Days are not supported. |
| `comment` | string | No | — | Optional work description (markdown). |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "time_spent": "2h 30m",
  "comment": "Implemented JWT token refresh logic"
}
```

**Output example**

```
Logged 2h 30m to PROJ-123 (worklog ID: 10055).
```

---

### get_task_time_tracking

Get time tracking information for a Jira task: original estimate, time spent, and remaining estimate.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |

**Input example**

```json
{ "task_key": "PROJ-123" }
```

**Output example**

```
Time Tracking for PROJ-123:
  Original estimate: 4h
  Time spent:        2h 30m
  Remaining:         1h 30m
```

---

## Template Tools (3)

### list_comment_templates

List available comment templates with optional category filter. Returns template metadata including required variables.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `category` | string | No | — | Filter by category: `"workflow"`, `"communication"`, `"reporting"`, or `"development"`. |

**Input example**

```json
{ "category": "workflow" }
```

**Output example**

```
Templates in category "workflow":

status-update: Status Update
  Variables: completed (required), next_steps (required), blockers (optional)

handoff-transition: Task Handoff
  Variables: from_person (required), to_person (required), context (required),
             remaining_work (required), decisions (optional)
```

---

### add_templated_comment

Add a comment using a registered template (with variable substitution) or raw markdown. Provide exactly one of `template_id` or `markdown`.

If you use ai-toolkit hooks, install [PATH: hooks/jira-mcp-hooks.json] to render the final comment preview and require explicit user approval before this tool executes.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `template_id` | string | No | — | Template identifier (from `list_comment_templates`). |
| `variables` | object | No | — | Key-value map of template variables. Required when using `template_id`. |
| `markdown` | string | No | — | Raw markdown. Use instead of `template_id` for freeform comments. |
| `user_approved` | boolean | Yes | — | Must be `true` only after the user explicitly approves posting the comment. |

**Input example (template)**

```json
{
  "task_key": "PROJ-123",
  "template_id": "status-update",
  "variables": {
    "completed": "Implemented JWT refresh token support",
    "next_steps": "Code review and QA",
    "blockers": "Waiting for staging environment"
  }
}
```

**Input example (raw markdown)**

```json
{
  "task_key": "PROJ-123",
  "markdown": "## Quick Note\n\nMeeting with client scheduled for tomorrow."
}
```

**Output example**

```
Added templated comment to PROJ-123 using template "status-update".
```

**Error:** If `template_id` is used without all required variables, returns the list of missing variable names.

---

### list_task_templates

List all available single-task templates used by `create_task`.

**Parameters**

None.

**Output example**

```json
{
  "templates": [
    {
      "id": "bug-task",
      "name": "Bug Task",
      "description": "Bug issue template with structured reproduction details",
      "summary": "Bug: {{title}}",
      "issue_type": "Bug",
      "priority": "High",
      "labels": ["bug"],
      "source": "system",
      "variables": [
        { "name": "title", "required": true }
      ]
    }
  ],
  "count": 3
}
```

---

### create_task

Create a new Jira issue with either explicit fields or a registered task template, plus optional assignee, labels, priority, and epic link.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `project_key` | string | Yes | — | Project key (e.g. `"PROJ"`). |
| `summary` | string | No | — | Issue title / summary. Required when `template_id` is omitted. |
| `description` | string | No | — | Optional issue description in markdown format. Automatically converted to ADF. Do not combine with `template_id`. |
| `template_id` | string | No | — | Task template identifier from `list_task_templates`. |
| `variables` | object | No | — | Template variables used when `template_id` is provided. |
| `type` | string | No | `"Task"` | Issue type name. |
| `priority` | string | No | `"Medium"` | Priority name. |
| `assignee_email` | string | No | — | Email of the assignee. |
| `labels` | array of string | No | — | Labels to apply to the issue. |
| `epic_key` | string | No | — | Epic issue key. |

**Input example (explicit fields)**

```json
{
  "project_key": "PROJ",
  "summary": "Implement login page",
  "description": "Build the first version of the login page",
  "priority": "High"
}
```

**Input example (task template)**

```json
{
  "project_key": "PROJ",
  "template_id": "bug-task",
  "variables": {
    "title": "Save button fails",
    "steps": "1. Open settings\n2. Click Save",
    "expected": "Settings should be saved",
    "actual": "Request fails with HTTP 500"
  }
}
```

**Output example**

```json
{
  "issue_key": "PROJ-42",
  "summary": "Bug: Save button fails",
  "message": "Created PROJ-42: Bug: Save button fails"
}
```

---

## Error Codes

| Code | Class | Trigger |
|------|-------|---------|
| `CONFIG_NOT_FOUND` | `ConfigNotFoundError` | config.json or credentials.json missing |
| `CONFIG_VALIDATION` | `ConfigValidationError` | Invalid JSON or schema mismatch |
| `JIRA_AUTH` | `JiraAuthenticationError` | HTTP 401 from Jira |
| `JIRA_PERMISSION` | `JiraPermissionError` | HTTP 403 from Jira |
| `JIRA_CONNECTION` | `JiraConnectionError` | Any other Jira API error |
| `CACHE_NOT_FOUND` | `CacheNotFoundError` | Cache file missing (run `sync_tasks` first) |
| `CACHE_CORRUPTION` | `CacheCorruptionError` | Cache has invalid JSON or fails schema validation |
| `TASK_NOT_FOUND` | `TaskNotFoundError` | Task key not in cache |
| `TEMPLATE_NOT_FOUND` | `TemplateNotFoundError` | Template ID not registered |
| `TEMPLATE_MISSING_VAR` | `TemplateMissingVariableError` | Required template variable not supplied |
| `ADF_CONVERSION` | `AdfConversionError` | ADF conversion failure (rare — has fallbacks) |

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Configuration Reference](./configuration.md)
- [Comment Templates](./templates.md)
- [ADF Conversion](./adf.md)
