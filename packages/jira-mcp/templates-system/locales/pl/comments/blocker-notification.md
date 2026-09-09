---
{
  "kind": "comment",
  "id": "blocker-notification",
  "name": "Zgłoszenie blokera (PL)",
  "description": "Zgłoszenie blokady z jej wpływem i potrzebnym działaniem",
  "category": "communication",
  "variables": [
    { "name": "blocked_by", "description": "Co blokuje", "required": true, "example": "Brak dostępów do bazy na stagingu" },
    { "name": "impact", "description": "Co się stanie, jeśli bloker nie zniknie", "required": true, "example": "Nie ruszą testy integracyjne" },
    { "name": "needed_action", "description": "Co trzeba zrobić, żeby odblokować", "required": true, "example": "DevOps zakłada dostęp do bazy na stagingu" },
    { "name": "deadline", "description": "Do kiedy trzeba to rozwiązać", "required": false, "default": "Jak najszybciej", "example": "2026-09-15" }
  ]
}
---
## Bloker

**Blokuje:** {{blocked_by}}

### Wpływ
{{impact}}

### Potrzebne działanie
{{needed_action}}

**Termin:** {{deadline}}
