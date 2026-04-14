---
title: "Jira MCP Server - Comment Templates Reference"
category: reference
service: jira-mcp
tags: [templates, comments, variables, bulk, placeholders]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Reference for the comment template system: template format, variable interpolation, all 8 built-in templates, custom templates, and bulk task creation templates."
---

# Jira MCP Server - Comment Templates Reference

## Overview

The template system provides two related features:

1. **Comment templates** — reusable markdown skeletons with variable substitution, posted via `add_templated_comment`.
2. **Bulk task creation templates** — JSON configs with date placeholders, used by `BulkTaskCreator`.

---

## Comment Template System

### Template Definition Format

```typescript
interface CommentTemplate {
  id: string;                     // Unique identifier (URL-safe slug)
  name: string;                   // Human-readable name
  description: string;            // What this template is for
  category: TemplateCategory;     // "workflow" | "communication" | "reporting" | "development"
  variables: TemplateVariable[];  // Declared variables
  body: string;                   // Markdown template body
}

interface TemplateVariable {
  name: string;         // Variable name (alphanumeric + underscore)
  description: string;  // Human-readable description
  required: boolean;    // If true, must be provided at render time
  defaultValue?: string; // Used when variable is absent and not required
  example?: string;     // Example value shown in listings
}
```

### Variable Interpolation

Two constructs are supported in template bodies:

**Direct replacement:** `{{variable_name}}`

Replaced with the variable's value, or its `defaultValue` if provided, or an empty string if absent.

```
Hello {{name}}!
```

**Conditional block:** `{{#variable_name}}...content...{{/variable_name}}`

The block and its contents are rendered only when `variable_name` is present and non-empty. When absent, the entire block (including surrounding whitespace) is removed. Consecutive blank lines are collapsed after removal.

```
{{#blockers}}### Blockers
{{blockers}}{{/blockers}}
```

### Rendering Process

1. Validate that all `required` variables are present in the supplied map. Return error if any are missing.
2. Apply default values from the template definition for absent optional variables.
3. Process all `{{#var}}...{{/var}}` conditional blocks.
4. Replace all remaining `{{var}}` placeholders.
5. Collapse runs of 3+ consecutive newlines to 2.
6. Trim leading/trailing whitespace.

### TemplateRegistry

The registry manages built-in and custom templates:

```typescript
const registry = new TemplateRegistry();           // built-ins only
const registry = new TemplateRegistry(customs);    // customs override built-ins with same id
```

Custom templates with the same `id` as a built-in replace the built-in entirely.

---

## Built-In Templates

### workflow: status-update

Standard status update with completed work, next steps, and blockers.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `completed` | Yes | — | `"Implemented user authentication flow"` |
| `next_steps` | Yes | — | `"Add unit tests for auth module"` |
| `blockers` | No | `"None"` | `"Waiting for API credentials"` |

**Body:**
```markdown
## Status Update

### Completed
{{completed}}

### Next Steps
{{next_steps}}

{{#blockers}}### Blockers
{{blockers}}{{/blockers}}
```

---

### communication: blocker-notification

Notify about a blocking issue with impact and needed action.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `blocked_by` | Yes | — | `"Missing database credentials for staging"` |
| `impact` | Yes | — | `"Cannot proceed with integration testing"` |
| `needed_action` | Yes | — | `"DevOps to provision staging DB credentials"` |
| `deadline` | No | `"ASAP"` | `"2026-04-15"` |

**Body:**
```markdown
## Blocker

**Blocked by:** {{blocked_by}}

### Impact
{{impact}}

### Action Needed
{{needed_action}}

**Deadline:** {{deadline}}
```

---

### workflow: handoff-transition

Provide context when handing off a task to another person.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `from_person` | Yes | — | `"John"` |
| `to_person` | Yes | — | `"Jane"` |
| `context` | Yes | — | `"Auth module is 80% complete, all tests passing"` |
| `remaining_work` | Yes | — | `"Add OAuth2 provider support"` |
| `decisions` | No | — | `"Using JWT for session management"` |

---

### communication: review-request

Request a code review with context and focus areas.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `reviewer` | Yes | — | `"Jane"` |
| `summary` | Yes | — | `"Added user authentication with JWT"` |
| `link` | Yes | — | `"https://github.com/org/repo/pull/123"` |
| `focus_areas` | No | — | `"Security of token generation"` |

---

### reporting: sprint-update

Sprint progress report with risks and decisions needed.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `progress` | Yes | — | `"7 of 10 stories completed"` |
| `risks` | Yes | — | `"Auth integration may slip to next sprint"` |
| `decisions_needed` | No | — | `"Should we de-scope OAuth2 support?"` |

---

### development: bug-report

Structured bug report with reproduction steps.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `steps` | Yes | — | `"1. Login as admin\n2. Navigate to /settings\n3. Click Save"` |
| `expected` | Yes | — | `"Settings should be saved"` |
| `actual` | Yes | — | `"Error 500 returned"` |
| `environment` | No | — | `"Chrome 120, macOS 14.2"` |

---

### development: deployment-note

Document a deployment with changes and rollback plan.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `changes` | Yes | — | `"User auth module v2.1"` |
| `rollback_plan` | Yes | — | `"Revert to tag v2.0.3"` |
| `monitoring` | No | — | `"Watch error rate on /api/auth/*"` |

---

### reporting: time-log-summary

Summary of work performed with time spent.

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `duration` | Yes | — | `"2h 30m"` |
| `work_description` | Yes | — | `"Refactored authentication middleware"` |

---

## Custom Template Creation

To add a custom template, pass it to `TemplateRegistry` at construction:

```typescript
const custom: CommentTemplate = {
  id: "my-template",
  name: "My Custom Template",
  description: "A custom template for my team",
  category: "workflow",
  variables: [
    { name: "summary", description: "Brief summary", required: true }
  ],
  body: "## Summary\n{{summary}}"
};

const registry = new TemplateRegistry([custom]);
```

If `id` matches a built-in, the custom template takes precedence.

---

## Bulk Task Creation Templates

`BulkTaskCreator` accepts a `BulkConfig` object that can contain date placeholders in any string field.

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

### TaskConfig Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `summary` | string | Yes | — | Primary summary (language `"pl"` or fallback) |
| `summary_en` | string | No | — | English summary (used when `language: "en"`) |
| `description` | string | No | — | Primary description (markdown) |
| `description_en` | string | No | — | English description |
| `type` | string | No | `"Task"` | Issue type name |
| `assignee` | string | No | — | Assignee email |
| `priority` | string | No | `"Medium"` | Priority name |
| `labels` | string[] | No | — | Label array |
| `estimate_hours` | number | No | — | Original estimate in hours |
| `status` | string | No | — | Target status after creation |

### BulkOptions Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dry_run` | boolean | `true` | Preview without API calls |
| `update_existing` | boolean | `false` | Update if task with matching summary exists |
| `match_field` | string | `"summary"` | Field used to detect existing tasks |
| `rate_limit_ms` | number | `500` | Delay between API calls (ms) |
| `force_reassign` | boolean | `false` | Re-assign after creation to override automation |
| `reassign_delay_ms` | number | `0` | Delay before force re-assign (ms) |
| `language` | `"pl"`, `"en"`, `"de"`, `"es"`, `"fr"`, `"pt"`, `"it"`, or `"nl"` | `"pl"` | Which summary/description to use |

### Date Placeholders

Placeholders are replaced via JSON round-tripping before the bulk config is processed. All string fields in the config support them.

| Placeholder | Example output | Description |
|-------------|---------------|-------------|
| `{MONTH}` | `"04.2026"` | Month and year (MM.YYYY) |
| `{YEAR}` | `"2026"` | Four-digit year |
| `{DATE}` | `"2026-04-13"` | ISO date (YYYY-MM-DD) |

**Example:** `"Sprint review {MONTH}"` with date 2026-04-13 becomes `"Sprint review 04.2026"`.

### Task Action Outcomes

| Action | Description |
|--------|-------------|
| `created` | New issue created in Jira |
| `updated` | Existing issue updated (`update_existing: true`) |
| `skipped` | Existing issue found, `update_existing: false` |
| `failed` | API call failed; error message included in result |
| `preview` | `dry_run: true` — no API call made |

---

## Related Documentation

- [API Reference](./api.md)
- [ADF Conversion](./adf.md)
- [Architecture Overview](./architecture.md)
