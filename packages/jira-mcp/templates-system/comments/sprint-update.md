---
{
  "kind": "comment",
  "id": "sprint-update",
  "name": "Sprint Update",
  "description": "Sprint progress report with risks and decisions needed",
  "category": "reporting",
  "variables": [
    { "name": "progress", "description": "Sprint progress summary", "required": true, "example": "7 of 10 stories completed" },
    { "name": "risks", "description": "Current risks to sprint goal", "required": true, "example": "Auth integration may slip to next sprint" },
    { "name": "decisions_needed", "description": "Decisions that need to be made", "required": false, "example": "Should we de-scope OAuth2 support?" }
  ]
}
---
## Sprint Update

### Progress
{{progress}}

### Risks
{{risks}}

{{#decisions_needed}}### Decisions Needed
{{decisions_needed}}{{/decisions_needed}}
