---
{
  "kind": "comment",
  "id": "status-update",
  "name": "Aktualizacja statusu (PL)",
  "description": "Standardowa aktualizacja statusu: co zrobione, co dalej, co blokuje",
  "category": "workflow",
  "variables": [
    { "name": "completed", "description": "Co zostało zrobione od ostatniej aktualizacji", "required": true, "example": "Zaimplementowane logowanie przez OAuth" },
    { "name": "next_steps", "description": "Kolejne kroki", "required": true, "example": "Testy jednostkowe modułu autoryzacji" },
    { "name": "blockers", "description": "Aktualne blokery", "required": false, "default": "Brak", "example": "Czekam na dostępy do stagingu" }
  ]
}
---
## Aktualizacja statusu

### Zrobione
{{completed}}

### Następne kroki
{{next_steps}}

{{#blockers}}### Blokery
{{blockers}}{{/blockers}}
