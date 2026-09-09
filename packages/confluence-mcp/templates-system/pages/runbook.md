---
{
  "id": "runbook",
  "name": "Runbook",
  "description": "Operational runbook: when to use it, prerequisites, steps, verification, rollback",
  "format": "markdown",
  "title": "{{system}} runbook: {{procedure}}",
  "labels": ["runbook"],
  "variables": [
    { "name": "system", "description": "System or service the runbook covers", "required": true, "example": "GitLab" },
    { "name": "procedure", "description": "What the runbook does", "required": true, "example": "token renewal" },
    { "name": "when", "description": "When to run this", "required": true, "example": "The CI token expires every 90 days." },
    { "name": "prerequisites", "description": "Access and tools needed", "required": false, "default": "None." },
    { "name": "steps", "description": "The procedure, as numbered steps", "required": true },
    { "name": "verification", "description": "How to confirm it worked", "required": true },
    { "name": "rollback", "description": "How to undo it", "required": false }
  ]
}
---
## When to use this

{{when}}

## Prerequisites

{{prerequisites}}

## Procedure

{{steps}}

## Verification

{{verification}}

{{#rollback}}
## Rollback

{{rollback}}
{{/rollback}}
