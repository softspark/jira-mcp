---
{
  "kind": "comment",
  "id": "time-log-summary",
  "name": "Time Log Summary",
  "description": "Summary of work performed with time spent",
  "category": "reporting",
  "variables": [
    { "name": "duration", "description": "Time spent", "required": true, "example": "2h 30m" },
    { "name": "work_description", "description": "What was done", "required": true, "example": "Refactored authentication middleware" }
  ]
}
---
## Time Logged

**Duration:** {{duration}}

### Work Performed
{{work_description}}
