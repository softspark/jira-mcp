---
{
  "id": "decision-record",
  "name": "Decision Record (storage)",
  "description": "Architecture decision record using Confluence info and status macros. For spaces configured with format=storage.",
  "format": "storage",
  "title": "ADR-{{number}}: {{title}}",
  "labels": ["adr", "decision"],
  "variables": [
    { "name": "number", "description": "ADR number", "required": true, "example": "042" },
    { "name": "title", "description": "The decision, as a short statement", "required": true, "example": "Split the MCP servers per product" },
    { "name": "status", "description": "Accepted, Superseded or Proposed", "required": false, "default": "Accepted" },
    { "name": "context", "description": "The forces at play", "required": true },
    { "name": "decision", "description": "What was decided", "required": true },
    { "name": "consequences", "description": "What this costs and enables", "required": true },
    { "name": "alternatives", "description": "What was rejected and why", "required": false }
  ]
}
---
<ac:structured-macro ac:name="status"><ac:parameter ac:name="title">{{status}}</ac:parameter></ac:structured-macro>
<h2>Context</h2>
<p>{{context}}</p>
<h2>Decision</h2>
<ac:structured-macro ac:name="info"><ac:rich-text-body><p>{{decision}}</p></ac:rich-text-body></ac:structured-macro>
<h2>Consequences</h2>
<p>{{consequences}}</p>
{{#alternatives}}
<h2>Alternatives considered</h2>
<p>{{alternatives}}</p>
{{/alternatives}}
