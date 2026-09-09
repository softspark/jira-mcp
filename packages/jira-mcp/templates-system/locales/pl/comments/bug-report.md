---
{
  "kind": "comment",
  "id": "bug-report",
  "name": "Zgłoszenie błędu (PL)",
  "description": "Uporządkowane zgłoszenie błędu z krokami odtworzenia",
  "category": "development",
  "variables": [
    { "name": "steps", "description": "Kroki odtworzenia", "required": true, "example": "1. Zaloguj się jako admin\\n2. Wejdź w /ustawienia\\n3. Kliknij Zapisz" },
    { "name": "expected", "description": "Zachowanie oczekiwane", "required": true, "example": "Ustawienia zapisują się bez błędu" },
    { "name": "actual", "description": "Zachowanie rzeczywiste", "required": true, "example": "Wraca błąd 500" },
    { "name": "environment", "description": "Środowisko", "required": false, "example": "Chrome 120, macOS 14.2, staging" }
  ]
}
---
## Zgłoszenie błędu

### Kroki odtworzenia
{{steps}}

### Oczekiwane
{{expected}}

### Rzeczywiste
{{actual}}

{{#environment}}### Środowisko
{{environment}}{{/environment}}
