---
{
  "kind": "task",
  "id": "review-follow-up",
  "name": "Review Follow-up",
  "description": "Follow-up task created from review findings or technical debt",
  "summary": "Follow-up: {{summary}}",
  "issue_type": "Task",
  "priority": "Medium",
  "labels": ["follow-up"],
  "variables": [
    { "name": "summary", "description": "Short task summary", "required": true, "example": "Harden token validation" },
    { "name": "problem", "description": "Observed problem or risk", "required": true, "example": "Token claims are not validated consistently" },
    { "name": "done_when", "description": "Completion criteria", "required": false, "example": "- Validation shared in one module\\n- Tests added" }
  ]
}
---
## Problem
{{problem}}

{{#done_when}}## Done When
{{done_when}}
{{/done_when}}
