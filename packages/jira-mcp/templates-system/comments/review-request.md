---
{
  "kind": "comment",
  "id": "review-request",
  "name": "Review Request",
  "description": "Request a code review with context and focus areas",
  "category": "communication",
  "variables": [
    { "name": "reviewer", "description": "Who should review", "required": true, "example": "Jane" },
    { "name": "summary", "description": "Summary of changes", "required": true, "example": "Added user authentication with JWT" },
    { "name": "link", "description": "PR or branch link", "required": true, "example": "https://github.com/org/repo/pull/123" },
    { "name": "focus_areas", "description": "What to focus the review on", "required": false, "example": "Security of token generation" }
  ]
}
---
## Review Request

**Reviewer:** {{reviewer}}

### Changes
{{summary}}

**Link:** {{link}}

{{#focus_areas}}### Focus Areas
{{focus_areas}}{{/focus_areas}}
