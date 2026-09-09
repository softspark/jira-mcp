---
{
  "id": "incident-review",
  "name": "Post-Incident Review",
  "description": "Blameless post-incident review: timeline, impact, root cause, actions",
  "format": "markdown",
  "title": "Post-incident review: {{title}} ({{date}})",
  "labels": ["incident", "post-mortem"],
  "variables": [
    { "name": "title", "description": "Short incident name", "required": true, "example": "Traefik 502s on prod" },
    { "name": "date", "description": "Incident date, YYYY-MM-DD", "required": true, "example": "2026-09-09" },
    { "name": "severity", "description": "Severity", "required": false, "default": "P2" },
    { "name": "impact", "description": "Who was affected and how", "required": true },
    { "name": "timeline", "description": "What happened, with timestamps", "required": true },
    { "name": "root_cause", "description": "What actually caused it", "required": true },
    { "name": "actions", "description": "Follow-up actions with owners", "required": true },
    { "name": "went_well", "description": "What worked during the response", "required": false }
  ]
}
---
**Severity:** {{severity}} | **Date:** {{date}}

## Impact

{{impact}}

## Timeline

{{timeline}}

## Root cause

{{root_cause}}

{{#went_well}}
## What went well

{{went_well}}
{{/went_well}}

## Follow-up actions

{{actions}}

This review is blameless. It records what the system allowed to happen, not who typed what.
