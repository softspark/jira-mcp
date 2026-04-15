---
{
  "kind": "comment",
  "id": "deployment-note",
  "name": "Deployment Note",
  "description": "Document a deployment with changes and rollback plan",
  "category": "development",
  "variables": [
    { "name": "changes", "description": "What was deployed", "required": true, "example": "User auth module v2.1" },
    { "name": "rollback_plan", "description": "How to rollback if needed", "required": true, "example": "Revert to tag v2.0.3" },
    { "name": "monitoring", "description": "What to monitor after deploy", "required": false, "example": "Watch error rate on /api/auth/*" }
  ]
}
---
## Deployment Note

### Changes
{{changes}}

### Rollback Plan
{{rollback_plan}}

{{#monitoring}}### Monitoring
{{monitoring}}{{/monitoring}}
