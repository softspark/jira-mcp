---
{
  "kind": "comment",
  "id": "bug-report",
  "name": "Bug Report",
  "description": "Structured bug report with reproduction steps",
  "category": "development",
  "variables": [
    { "name": "steps", "description": "Steps to reproduce", "required": true, "example": "1. Login as admin\\n2. Navigate to /settings\\n3. Click Save" },
    { "name": "expected", "description": "Expected behavior", "required": true, "example": "Settings should be saved" },
    { "name": "actual", "description": "Actual behavior", "required": true, "example": "Error 500 returned" },
    { "name": "environment", "description": "Environment details", "required": false, "example": "Chrome 120, macOS 14.2" }
  ]
}
---
## Bug Report

### Steps to Reproduce
{{steps}}

### Expected
{{expected}}

### Actual
{{actual}}

{{#environment}}### Environment
{{environment}}{{/environment}}
