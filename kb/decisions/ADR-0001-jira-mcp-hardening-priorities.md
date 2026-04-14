---
title: "ADR-0001: Hardening Before Refactor for jira-mcp"
category: decisions
service: jira-mcp
status: proposed
created: "2026-04-14"
last_updated: "2026-04-14"
---

# ADR-0001: Hardening Before Refactor for `jira-mcp`

## Status
Proposed

## Context
The repository audit showed that the biggest risks currently sit in release hardening, critical boundary tests, and `JiraConnector` resilience. `src/server.ts` is large and tempting to refactor, but refactoring before tests and publish gates are in place increases regression risk.

Plan Mode for changes with architectural impact requires a documented decision and explicit alternatives. [PATH: kb/procedures/plan-implementation-sop.md] [PATH: kb/howto/use-plan-mode.md]

## Decision
We adopt the following strategy:
1. Release hardening and boundary tests first.
2. Connector resilience and docs parity second.
3. Optional `src/server.ts` refactor only after that.

## Consequences

### Positive
- lower risk of a bad release,
- faster trust improvement for the repository,
- a safer base for later refactoring,
- better short-term ROI.

### Negative
- `src/server.ts` remains larger than ideal for some time,
- the first phase is less “visibly elegant” than a refactor-first approach,
- some architectural debt is consciously deferred.

## Alternatives Considered

### Alternative A — Refactor first
Rejected because it increases regression risk before tests and gates are in place.

### Alternative B — Compliance only
Rejected because it improves release process only, but leaves runtime boundaries exposed.

### Alternative C — Hardening first
Accepted (proposed) because it reduces the real risk surface most effectively.

## Guardrails
- Do not add new MCP features in this workstream.
- Do not increase runtime dependencies without documented justification in an ADR.
- Do not weaken coverage or quality gates.
- Any refactor after P0/P1 must be protected by tests.

## Review Trigger
Revisit this decision if dependency upgrades turn out to be breaking, or if boundary tests reveal the need for a larger redesign.
