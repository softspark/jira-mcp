---
{
  "kind": "task",
  "id": "default-task",
  "name": "Default Task",
  "description": "Generic task template with summary and optional context",
  "summary": "{{summary}}",
  "issue_type": "Task",
  "priority": "Medium",
  "variables": [
    { "name": "summary", "description": "Task summary", "required": true, "example": "Prepare April admin report" },
    { "name": "context", "description": "Extra context for the task", "required": false, "example": "Use the latest export from Finance" },
    { "name": "acceptance_criteria", "description": "Acceptance criteria", "required": false, "example": "- Report shared with stakeholders" }
  ]
}
---
{{#context}}## Context
{{context}}
{{/context}}

{{#acceptance_criteria}}## Acceptance Criteria
{{acceptance_criteria}}
{{/acceptance_criteria}}
