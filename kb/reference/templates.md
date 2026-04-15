---
title: "Jira MCP Server - Templates Reference"
category: reference
service: jira-mcp
tags: [templates, comments, tasks, variables, bulk, placeholders]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-15"
description: "Reference for the file-backed template system: comment templates, task templates for create_task, user overrides, and bulk task creation templates."
---

# Jira MCP Server - Templates Reference

## Overview

The template system provides three related features:

1. **Comment templates** — reusable markdown skeletons with variable substitution, posted via `add_templated_comment`.
2. **Task templates** — reusable markdown-backed templates for `create_task`.
3. **Bulk task creation templates** — JSON configs with date placeholders, used by `BulkTaskCreator`.

## File-Backed Templates

Comment and single-task templates are stored as markdown files with a JSON metadata block:

```md
---
{
  "kind": "comment",
  "id": "status-update",
  "name": "Status Update",
  "description": "Standard status update",
  "category": "workflow",
  "variables": [
    { "name": "completed", "required": true }
  ]
}
---
## Status Update
{{completed}}
```

For task templates, `kind` is `"task"` and metadata includes a `summary` template string.

## Template Resolution

System templates ship inside the package. User overrides live under:

```text
~/.softspark/jira-mcp/templates/comments/
~/.softspark/jira-mcp/templates/task-templates/
```

Resolution order:

1. User file in `~/.softspark/jira-mcp/templates/...`
2. System file shipped with the package

If a user file has the same `id` as a system template, the user file wins globally for all projects.

## Variable Interpolation

Both comment and task templates support the same constructs:

- Direct replacement: `{{variable_name}}`
- Conditional block: `{{#variable_name}}...{{/variable_name}}`

Rendering process:

1. Validate that all required variables are present.
2. Apply default values for optional variables when declared.
3. Process conditional blocks.
4. Replace remaining placeholders.
5. Collapse runs of 3+ blank lines to 2.
6. Trim leading/trailing whitespace.

## Comment Templates

Comment template metadata:

```typescript
interface CommentTemplate {
  id: string;
  name: string;
  description: string;
  category: "workflow" | "communication" | "reporting" | "development";
  variables: TemplateVariable[];
  body: string;
}
```

Built-in comment templates:

- `status-update`
- `blocker-notification`
- `handoff-transition`
- `review-request`
- `sprint-update`
- `bug-report`
- `deployment-note`
- `time-log-summary`

## Task Templates

Task templates are used by `create_task` with `template_id` + `variables`.

Task template metadata:

```typescript
interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  summary: string;
  issueType?: string;
  priority?: string;
  labels?: string[];
  epicKey?: string;
  variables: TemplateVariable[];
  body: string;
}
```

Example:

```md
---
{
  "kind": "task",
  "id": "bug-task",
  "name": "Bug Task",
  "description": "Structured bug issue",
  "summary": "Bug: {{title}}",
  "issue_type": "Bug",
  "priority": "High",
  "labels": ["bug"],
  "variables": [
    { "name": "title", "required": true },
    { "name": "steps", "required": true }
  ]
}
---
## Steps To Reproduce
{{steps}}
```

Built-in task templates:

- `default-task`
- `bug-task`
- `review-follow-up`

`create_task` can still be used without a template by passing explicit `summary` and optional `description`.

## Importing User Templates

Install a user template with CLI:

```bash
jira-mcp template add comment ./my-status-update.md
jira-mcp template add task ./my-bug-task.md
```

If `id` matches a built-in, the imported file becomes the active template globally.

## Bulk Task Creation Templates

`BulkTaskCreator` accepts a `BulkConfig` JSON object that can contain date placeholders in any string field.

### BulkConfig Format

```json
{
  "epic_key": "PROJ-100",
  "tasks": [
    {
      "summary": "Sprint review {MONTH}",
      "summary_en": "Sprint Review {MONTH}",
      "description": "Review for {MONTH}",
      "type": "Task",
      "assignee": "user@example.com",
      "priority": "Medium",
      "labels": ["sprint", "review"],
      "estimate_hours": 2,
      "status": "In Progress"
    }
  ],
  "options": {
    "dry_run": false,
    "update_existing": false,
    "match_field": "summary",
    "rate_limit_ms": 500,
    "force_reassign": false,
    "reassign_delay_ms": 0,
    "language": "en"
  }
}
```

### Date Placeholders

Supported placeholders in bulk JSON:

- `{MONTH}` → `04.2026`
- `{YEAR}` → `2026`
- `{DATE}` → `2026-04-13`

## Related Documentation

- [API Reference](./api.md)
- [ADF Conversion](./adf.md)
- [Configuration Reference](./configuration.md)
