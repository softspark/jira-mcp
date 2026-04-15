---
{
  "kind": "comment",
  "id": "status-update",
  "name": "Status Update",
  "description": "Standard status update with completed work, next steps, and blockers",
  "category": "workflow",
  "variables": [
    { "name": "completed", "description": "Work completed since last update", "required": true, "example": "Implemented user authentication flow" },
    { "name": "next_steps", "description": "Planned next steps", "required": true, "example": "Add unit tests for auth module" },
    { "name": "blockers", "description": "Current blockers or impediments", "required": false, "default": "None", "example": "Waiting for API credentials" }
  ]
}
---
## Status Update

### Completed
{{completed}}

### Next Steps
{{next_steps}}

{{#blockers}}### Blockers
{{blockers}}{{/blockers}}
