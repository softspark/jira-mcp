---
{
  "kind": "comment",
  "id": "handoff-transition",
  "name": "Przekazanie zadania (PL)",
  "description": "Kontekst przy przekazywaniu zadania innej osobie",
  "category": "workflow",
  "variables": [
    { "name": "from_person", "description": "Kto przekazuje", "required": true, "example": "Marcin" },
    { "name": "to_person", "description": "Kto przejmuje", "required": true, "example": "Ania" },
    { "name": "context", "description": "Stan zadania i kontekst", "required": true, "example": "Moduł autoryzacji gotowy w 80 procentach, testy przechodzą" },
    { "name": "remaining_work", "description": "Co zostało do zrobienia", "required": true, "example": "Dodać obsługę logowania przez Google" },
    { "name": "decisions", "description": "Decyzje już podjęte", "required": false, "example": "Sesje trzymamy w JWT" }
  ]
}
---
## Przekazanie zadania

**Od:** {{from_person}} **Do:** {{to_person}}

### Kontekst
{{context}}

### Do zrobienia
{{remaining_work}}

{{#decisions}}### Podjęte decyzje
{{decisions}}{{/decisions}}
