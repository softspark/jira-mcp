---
{
  "kind": "comment",
  "id": "handoff-transition",
  "name": "Task Handoff",
  "description": "Provide context when handing off a task to another person",
  "category": "workflow",
  "variables": [
    { "name": "from_person", "description": "Person handing off", "required": true, "example": "John" },
    { "name": "to_person", "description": "Person receiving", "required": true, "example": "Jane" },
    { "name": "context", "description": "Current state and context", "required": true, "example": "Auth module is 80% complete, all tests passing" },
    { "name": "remaining_work", "description": "What still needs to be done", "required": true, "example": "Add OAuth2 provider support" },
    { "name": "decisions", "description": "Key decisions already made", "required": false, "example": "Using JWT for session management" }
  ]
}
---
## Task Handoff

**From:** {{from_person}} **To:** {{to_person}}

### Context
{{context}}

### Remaining Work
{{remaining_work}}

{{#decisions}}### Key Decisions Made
{{decisions}}{{/decisions}}
