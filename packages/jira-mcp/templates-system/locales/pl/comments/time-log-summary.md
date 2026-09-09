---
{
  "kind": "comment",
  "id": "time-log-summary",
  "name": "Podsumowanie czasu (PL)",
  "description": "Podsumowanie wykonanej pracy wraz z poświęconym czasem",
  "category": "reporting",
  "variables": [
    { "name": "duration", "description": "Poświęcony czas w formacie godziny i minuty", "required": true, "example": "2h 30m" },
    { "name": "work_description", "description": "Co zostało zrobione", "required": true, "example": "Refaktor warstwy autoryzacji" }
  ]
}
---
## Zalogowany czas

**Czas:** {{duration}}

### Wykonana praca
{{work_description}}
