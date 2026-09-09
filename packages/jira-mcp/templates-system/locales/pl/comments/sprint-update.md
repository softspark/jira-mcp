---
{
  "kind": "comment",
  "id": "sprint-update",
  "name": "Podsumowanie sprintu (PL)",
  "description": "Raport z postępu sprintu wraz z ryzykami i decyzjami do podjęcia",
  "category": "reporting",
  "variables": [
    { "name": "progress", "description": "Postęp sprintu", "required": true, "example": "7 z 10 zadań zamkniętych" },
    { "name": "risks", "description": "Ryzyka dla celu sprintu", "required": true, "example": "Integracja z płatnościami może się przesunąć" },
    { "name": "decisions_needed", "description": "Decyzje, które trzeba podjąć", "required": false, "example": "Czy wycinamy logowanie przez Google z tego sprintu?" }
  ]
}
---
## Podsumowanie sprintu

### Postęp
{{progress}}

### Ryzyka
{{risks}}

{{#decisions_needed}}### Decyzje do podjęcia
{{decisions_needed}}{{/decisions_needed}}
