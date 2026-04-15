---
{
  "kind": "comment",
  "id": "blocker-notification",
  "name": "Blocker Notification",
  "description": "Notify about a blocking issue with impact and needed action",
  "category": "communication",
  "variables": [
    { "name": "blocked_by", "description": "What is causing the blockage", "required": true, "example": "Missing database credentials for staging" },
    { "name": "impact", "description": "Impact if blocker is not resolved", "required": true, "example": "Cannot proceed with integration testing" },
    { "name": "needed_action", "description": "What action is needed to unblock", "required": true, "example": "DevOps to provision staging DB credentials" },
    { "name": "deadline", "description": "When this needs to be resolved", "required": false, "default": "ASAP", "example": "2026-04-15" }
  ]
}
---
## Blocker

**Blocked by:** {{blocked_by}}

### Impact
{{impact}}

### Action Needed
{{needed_action}}

**Deadline:** {{deadline}}
