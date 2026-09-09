---
{
  "kind": "comment",
  "id": "deployment-note",
  "name": "Notatka z wdrożenia (PL)",
  "description": "Opis wdrożenia wraz z planem wycofania",
  "category": "development",
  "variables": [
    { "name": "changes", "description": "Co zostało wdrożone", "required": true, "example": "Moduł autoryzacji 2.1" },
    { "name": "rollback_plan", "description": "Jak wycofać zmianę", "required": true, "example": "Powrót do tagu v2.0.3" },
    { "name": "monitoring", "description": "Co obserwować po wdrożeniu", "required": false, "example": "Poziom błędów na /api/auth/*" }
  ]
}
---
## Notatka z wdrożenia

### Zmiany
{{changes}}

### Plan wycofania
{{rollback_plan}}

{{#monitoring}}### Co obserwować
{{monitoring}}{{/monitoring}}
