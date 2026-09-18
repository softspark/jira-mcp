---
title: "Jira MCP Server - API Reference"
category: reference
service: jira-mcp
tags: [api, mcp, tools, jira, tempo]
version: "1.16.0"
created: "2026-04-13"
last_updated: "2026-09-18"
description: "Complete reference for all MCP tools exposed by the Jira MCP server, including parameters, return values, and examples."
---

# Jira MCP Server - API Reference

All tools communicate over stdio using the MCP JSON-RPC protocol. Every tool returns `{ content: [{ type: "text", text: "..." }] }`.

## Task Management Tools (14)

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
  "creator": "pm@example.com",
  "reporter": "client@example.com",
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

### search_tasks

Search Jira issues with raw JQL, hitting the API directly. Results are returned immediately and are not written to the local cache.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `jql` | string | Yes | — | JQL query string. |
| `max_results` | number | No | `50` | Maximum number of results to return. |
| `project_key` | string | No | default project | Project key that selects the Jira instance to query. |

**Input example**

```json
{
  "jql": "project = PROJ AND status = \"In Progress\" ORDER BY updated DESC",
  "max_results": 10
}
```

**Output example**

```json
{
  "results": [
    {
      "key": "PROJ-123",
      "summary": "Implement login page",
      "status": "In Progress",
      "assignee": "user@example.com",
      "creator": "pm@example.com",
      "reporter": "client@example.com",
      "priority": "High",
      "issueType": "Story",
      "created": "2026-04-01T09:00:00.000+0000",
      "updated": "2026-04-10T14:30:00.000+0000",
      "projectKey": "PROJ",
      "epicLink": null
    }
  ],
  "count": 1,
  "total_available": 23,
  "message": "Found 1 issue(s) matching JQL query"
}
```

`creator` is the account that filed the issue and never changes. `reporter` is the editable "reported by" field and is `null` when empty. Both hold the email, or the display name when Atlassian privacy settings hide the email. To filter by them, put it in the JQL: `creator = "pm@example.com"` or `reporter = currentUser()`.

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

```json
{
  "success": true,
  "task": {
    "key": "PROJ-123",
    "summary": "Implement login page",
    "description": "Implement the login page with JWT authentication.",
    "status": "In Progress",
    "assignee": "user@example.com",
    "creator": "pm@example.com",
    "reporter": "client@example.com",
    "priority": "High",
    "issueType": "Story",
    "created": "2026-04-01T09:00:00.000+0000",
    "updated": "2026-04-10T14:30:00.000+0000",
    "comments": [
      {
        "id": "10001",
        "author": "reviewer@example.com",
        "body": "Looks good, please add refresh token support.",
        "created": "2026-04-01T11:00:00.000+0000"
      }
    ]
  },
  "language": "en",
  "message": "Retrieved details for PROJ-123"
}
```

`creator` is the account that filed the issue. `reporter` is the editable "reported by" field. Either is `null` when Jira returns none. Both hold the email, or the display name when Atlassian privacy settings hide the email.

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
| `original_estimate` | string | No | — | New original estimate as `"2h"`, `"30m"`, or `"2h 30m"`. Days are rejected. |
| `remaining_estimate` | string | No | — | New remaining estimate, same format. Independent of `original_estimate`: writing one leaves the other unchanged. |

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

### delete_task

Delete a Jira task. Allowed only when the authenticated user is the task creator. Requires explicit user approval.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `user_approved` | boolean | Yes | — | Must be `true` only after the user explicitly approves deleting this task. |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "user_approved": true
}
```

**Output example**

```json
{
  "deleted": { "task_key": "PROJ-123" },
  "message": "Deleted task PROJ-123"
}
```

**Error:** Fails when the caller is not the task creator or when `user_approved` is not `true`.

---

### delete_comment

Delete a comment from a Jira task. Allowed only when the authenticated user is the comment author. Requires explicit user approval.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task_key` | string | Yes | — | Task key (e.g. `"PROJ-123"`). |
| `comment_id` | string | Yes | — | Comment ID to delete. |
| `user_approved` | boolean | Yes | — | Must be `true` only after the user explicitly approves deleting this comment. |

**Input example**

```json
{
  "task_key": "PROJ-123",
  "comment_id": "10042",
  "user_approved": true
}
```

**Output example**

```json
{
  "deleted": { "task_key": "PROJ-123", "comment_id": "10042" },
  "message": "Deleted comment 10042 from PROJ-123"
}
```

**Error:** Fails when the caller is not the comment author or when `user_approved` is not `true`.

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

## Template & Creation Tools (4)

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
| `epic_key` | string | No | — | Epic issue key. Writes the Epic Link custom field. |
| `parent_key` | string | No | — | Parent issue key. Writes the `parent` field, which Jira requires for sub-task issue types. |
| `original_estimate` | string | No | — | Original estimate as `"2h"`, `"30m"`, or `"2h 30m"`. Days are rejected. |

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

## Bulk Tools (1)

### create_monthly_tasks

Run all `monthly_admin.json` bulk task configs found under `~/.softspark/jira-mcp/templates/tasks/<KEY>/`. Defaults to a dry-run preview; pass `execute: true` to actually create tasks in Jira. The handler validates each config against `BulkConfigSchema`, replaces date placeholders (`{MONTH}`, `{YEAR}`, `{DATE}`), resolves the project language, and dispatches per-project to the correct Jira instance via `InstancePool`.

Per-project errors do not abort the whole call; they are reported in the `configs` array with `status: "error"`.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `execute` | boolean | No | `false` | When `true`, create tasks for real. When `false` or omitted, run a dry-run preview. |
| `project` | string | No | — | Optional project key (case-insensitive) to restrict execution to a single project subdirectory. |

**Input example**

```json
{ "execute": false }
```

**Output example**

```json
{
  "success": true,
  "execute": false,
  "total_processed": 2,
  "total_failed": 0,
  "total_succeeded": 2,
  "configs": [
    {
      "project_key": "BIEL",
      "config_path": "/Users/me/.softspark/jira-mcp/templates/tasks/BIEL/monthly_admin.json",
      "status": "success",
      "summary": { "created": 0, "updated": 0, "failed": 0, "skipped": 0, "previewed": 1 },
      "dry_run": true
    },
    {
      "project_key": "E8A",
      "config_path": "/Users/me/.softspark/jira-mcp/templates/tasks/E8A/monthly_admin.json",
      "status": "success",
      "summary": { "created": 0, "updated": 0, "failed": 0, "skipped": 0, "previewed": 1 },
      "dry_run": true
    }
  ]
}
```

To install or update a `monthly_admin.json` template, use the CLI command `jira-mcp template add bulk <source.json> --project <KEY>`.

---

## Tempo Tools (2)

Both tools read Tempo Timesheets through the Tempo Cloud REST API v4 and need a Tempo API token on the site's credential (`jira-mcp config set-tempo-token`). Without one they fail with `TEMPO_NOT_CONFIGURED` before any network call. Tempo answers in numeric ids only, so every result is joined against Jira: issue ids become keys and summaries through `issue/bulkfetch`, account ids become names through `user/bulk`. An issue the token cannot browse keeps its hours under `#<id>` with the summary `(issue not visible)` rather than dropping out of a total.

Dates are `YYYY-MM-DD` and inclusive. `project_key`, `task_key` and `user_email` combine; the project key (or the task key's prefix, or the default project) also selects the Jira instance. A `task_key` outside the given `project_key` is rejected.

### search_tempo_worklogs

List Tempo worklogs in a date range. The whole match is fetched and summed, so `total_time_spent` is right even when `limit` trims the list.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | Yes | — | Inclusive start date, `YYYY-MM-DD`. |
| `to` | string | Yes | — | Inclusive end date, `YYYY-MM-DD`. |
| `project_key` | string | No | — | Restrict to one project. |
| `task_key` | string | No | — | Restrict to one task. |
| `user_email` | string | No | — | Restrict to worklogs logged by this user. |
| `limit` | number | No | `200` | Maximum worklogs returned (max 2000). |

**Input example**

```json
{
  "from": "2026-09-01",
  "to": "2026-09-30",
  "project_key": "DEVOPS",
  "user_email": "ann@example.com"
}
```

**Output example**

```json
{
  "success": true,
  "from": "2026-09-01",
  "to": "2026-09-30",
  "filters": { "project_key": "DEVOPS", "task_key": null, "user_email": "ann@example.com" },
  "count": 2,
  "total_available": 2,
  "truncated": false,
  "total_time_spent": "3h 30m",
  "total_seconds": 12600,
  "worklogs": [
    {
      "worklog_id": "50123",
      "task_key": "DEVOPS-37",
      "summary": "Rotate the backup keys",
      "project_key": "DEVOPS",
      "user": { "account_id": "5b10ac8d82e05b22cc7d4ef5", "display_name": "Ann Kowalska", "email": "ann@example.com" },
      "date": "2026-09-02",
      "start_time": "09:00:00",
      "time_spent": "2h",
      "time_spent_seconds": 7200,
      "billable_seconds": 7200,
      "description": "Rotated and verified restore"
    },
    {
      "worklog_id": "50140",
      "task_key": "DEVOPS-41",
      "summary": "Monthly patching",
      "project_key": "DEVOPS",
      "user": { "account_id": "5b10ac8d82e05b22cc7d4ef5", "display_name": "Ann Kowalska", "email": "ann@example.com" },
      "date": "2026-09-03",
      "start_time": null,
      "time_spent": "1h 30m",
      "time_spent_seconds": 5400,
      "billable_seconds": 0,
      "description": ""
    }
  ],
  "message": "Found 2 Tempo worklog(s) between 2026-09-01 and 2026-09-30"
}
```

`user.email` is `null` when Jira's privacy settings hide it or the account is unknown.

---

### get_tempo_report

Sum Tempo hours in a date range by one or more dimensions, in the order given. Rows come back largest first.

**Parameters**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | Yes | — | Inclusive start date, `YYYY-MM-DD`. |
| `to` | string | Yes | — | Inclusive end date, `YYYY-MM-DD`. |
| `group_by` | string[] | No | `["project", "user"]` | Any order of `project`, `user`, `task`, each at most once. A comma-separated string is accepted too. |
| `project_key` | string | No | — | Restrict to one project. |
| `task_key` | string | No | — | Restrict to one task. |
| `user_email` | string | No | — | Restrict to worklogs logged by this user. |

Common shapes: `["user"]` for hours per person, `["user", "task"]` for what each person worked on, `["task"]` for hours per task, `["project"]` for hours per project across a site.

**Input example**

```json
{
  "from": "2026-09-01",
  "to": "2026-09-30",
  "project_key": "DEVOPS",
  "group_by": ["user", "task"]
}
```

**Output example**

```json
{
  "success": true,
  "from": "2026-09-01",
  "to": "2026-09-30",
  "group_by": ["user", "task"],
  "filters": { "project_key": "DEVOPS", "task_key": null, "user_email": null },
  "total_time_spent": "5h 30m",
  "total_hours": 5.5,
  "total_seconds": 19800,
  "billable_seconds": 14400,
  "worklog_count": 3,
  "rows": [
    {
      "user": "Ann Kowalska",
      "user_email": "ann@example.com",
      "task": "DEVOPS-37",
      "summary": "Rotate the backup keys",
      "time_spent": "2h",
      "hours": 2,
      "time_spent_seconds": 7200,
      "billable_seconds": 7200,
      "worklog_count": 1
    },
    {
      "user": "Bob Nowak",
      "user_email": null,
      "task": "DEVOPS-40",
      "summary": "Upgrade the runners",
      "time_spent": "2h",
      "hours": 2,
      "time_spent_seconds": 7200,
      "billable_seconds": 7200,
      "worklog_count": 1
    },
    {
      "user": "Ann Kowalska",
      "user_email": "ann@example.com",
      "task": "DEVOPS-41",
      "summary": "Monthly patching",
      "time_spent": "1h 30m",
      "hours": 1.5,
      "time_spent_seconds": 5400,
      "billable_seconds": 0,
      "worklog_count": 1
    }
  ],
  "message": "5h 30m logged in Tempo between 2026-09-01 and 2026-09-30 across 3 row(s)"
}
```

Only the grouped dimensions appear on a row: `project` for `project`, `user` plus `user_email` for `user`, `task` plus `summary` for `task`. `hours` is decimal to two places for spreadsheets; `time_spent` is the same value as `"2h 30m"`.

---

## Error Codes

| Code | Class | Trigger |
|------|-------|---------|
| `CONFIG_NOT_FOUND` | `ConfigNotFoundError` | config.json or credentials.json missing |
| `CONFIG_VALIDATION` | `ConfigValidationError` | Invalid JSON or schema mismatch |
| `JIRA_AUTH` | `JiraAuthenticationError` | HTTP 401 from Jira |
| `JIRA_PERMISSION` | `JiraPermissionError` | HTTP 403 from Jira |
| `JIRA_CONNECTION` | `JiraConnectionError` | Any other Jira API error |
| `TEMPO_NOT_CONFIGURED` | `TempoNotConfiguredError` | A Tempo tool was called for a site with no `tempo_token` |
| `TEMPO_AUTH` | `TempoAuthenticationError` | HTTP 401 from Tempo |
| `TEMPO_PERMISSION` | `TempoPermissionError` | HTTP 403 from Tempo |
| `TEMPO_CONNECTION` | `TempoConnectionError` | Any other Tempo API error, or a query past the 50 000 worklog cap |
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
