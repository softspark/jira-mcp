---
{
  "kind": "task",
  "id": "bug-task",
  "name": "Bug Task",
  "description": "Bug issue template with structured reproduction details",
  "summary": "Bug: {{title}}",
  "issue_type": "Bug",
  "priority": "High",
  "labels": ["bug"],
  "variables": [
    { "name": "title", "description": "Short bug title", "required": true, "example": "Save button returns 500" },
    { "name": "steps", "description": "Steps to reproduce", "required": true, "example": "1. Open settings\\n2. Click Save" },
    { "name": "expected", "description": "Expected behavior", "required": true, "example": "Settings should be saved" },
    { "name": "actual", "description": "Actual behavior", "required": true, "example": "Request fails with HTTP 500" },
    { "name": "environment", "description": "Environment details", "required": false, "example": "Production, Chrome 123" }
  ]
}
---
## Steps To Reproduce
{{steps}}

## Expected
{{expected}}

## Actual
{{actual}}

{{#environment}}## Environment
{{environment}}
{{/environment}}
