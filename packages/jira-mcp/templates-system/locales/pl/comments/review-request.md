---
{
  "kind": "comment",
  "id": "review-request",
  "name": "Prośba o review (PL)",
  "description": "Prośba o przegląd kodu z kontekstem i obszarami do sprawdzenia",
  "category": "communication",
  "variables": [
    { "name": "reviewer", "description": "Kto ma zrobić review", "required": true, "example": "Ania" },
    { "name": "summary", "description": "Podsumowanie zmian", "required": true, "example": "Logowanie przez OAuth plus odświeżanie tokenu" },
    { "name": "link", "description": "Link do PR albo gałęzi", "required": true, "example": "https://gitlab.com/zespol/repo/-/merge_requests/123" },
    { "name": "focus_areas", "description": "Na co zwrócić szczególną uwagę", "required": false, "example": "Bezpieczeństwo generowania tokenów" }
  ]
}
---
## Prośba o review

**Do przeglądu:** {{reviewer}}

### Zmiany
{{summary}}

**Link:** {{link}}

{{#focus_areas}}### Na co zwrócić uwagę
{{focus_areas}}{{/focus_areas}}
