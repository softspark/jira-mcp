# Contributing

We welcome bug fixes, new MCP tools/resources, and improvements. This guide explains how to contribute.

## Workflow

1. **Fork** the repository and clone your fork
2. **Create a branch** from `main`: `git checkout -b feat/my-change`
3. **Make your changes** -- follow the conventions below
4. **Run all checks** locally (see CI Requirements)
5. **Push** to your fork and open a **Pull Request** against `main`
6. The maintainer will review, pull the branch locally if needed, adjust documentation, and merge

> **Note:** Documentation updates (README, CHANGELOG, etc.) are handled by the maintainer after merge. You do not need to update these yourself.

## Branch Naming

| Prefix | Use |
|--------|-----|
| `feat/` | New MCP tool, resource, or feature |
| `fix/` | Bug fix |
| `refactor/` | Code improvement without behavior change |
| `docs/` | Documentation-only change |
| `test/` | Test-only change |

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add get-sprint-tasks tool
fix: handle Jira 429 rate-limit response
refactor: extract JQL builder into utility
test: add integration tests for sync_tasks
```

- One logical change per commit
- Keep the subject line under 72 characters
- No `WIP` commits in the final PR

## CI Requirements

Your PR must pass **all** CI jobs before review. Run them locally:

```bash
# All of these must pass with zero errors:
npm run build        # TypeScript compilation
npm run lint         # ESLint (zero warnings)
npm run test         # Vitest test suite
```

Additionally, CI runs:
- **TypeScript compile check** (`npx tsc --noEmit`)
- **Required files check** (LICENSE, CHANGELOG, SECURITY, etc.)

## What to Contribute

**Good first contributions:**
- Bug fixes with a reproducing test
- New MCP tools (follow existing patterns in `src/tools/`)
- New MCP resources
- Improved Jira API error handling
- Better type definitions for Jira responses

**Please open an issue first for:**
- New tool categories
- Breaking changes to existing tool schemas
- Changes to the multi-instance routing logic
- Changes to CI/CD workflows

## Coding Standards

- **TypeScript strict mode:** no `any` types
- **Tests:** vitest, co-located or in `tests/` directory
- **Dependencies:** minimize runtime deps -- every new dependency must be justified
- **Validation:** validate all MCP tool inputs at the boundary
- **Error handling:** return structured MCP error responses, never throw unhandled

## Security

- No secrets, API keys, or tokens in code
- No logging of Jira credentials or tokens
- No telemetry or phone-home behavior
- Review the [Security Policy](../SECURITY.md) for scope

## Bug Reports and Feature Requests

- **Bugs:** use the [Bug Report](../../issues/new?template=bug_report.md) template
- **Features:** open an issue with the `enhancement` label
- **Security vulnerabilities:** email `biuro@softspark.eu` (do not open a public issue)
