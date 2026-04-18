---
title: "SOP: Pre-Commit Quality Checklist"
category: procedures
service: jira-mcp
tags: [sop, pre-commit, quality, lint, typecheck, test, build, security, version-sync]
version: "1.1.0"
created: "2026-04-13"
last_updated: "2026-04-18"
description: "Pre-commit quality checklist for @softspark/jira-mcp — TypeScript type check, ESLint, tests, build, secret scan, version sync (package.json ↔ package-lock.json), conventional commit format, and branch naming."
---

# SOP: Pre-Commit Quality Checklist

Complete checklist to run **before every commit** to `@softspark/jira-mcp`.
Mirrors the CI pipeline (`.github/workflows/ci.yml`) so failures are caught locally.

**Time:** 1-2 minutes

---

## Quick Run (One-Liner)

```bash
npm run typecheck && npm run lint && npm test && npm run build && python3 scripts/validate_counts.py
```

Copy-paste this before every commit. If any step fails, do not commit.

---

## Step-by-Step Checklist

### Step 1: TypeScript Type Check

```bash
npm run typecheck
```

- [ ] Command exits with code 0
- [ ] Zero type errors reported
- [ ] No `any` types introduced (strict mode enforced via `tsconfig.json`)

**Expected output:** No output on success (clean exit).

**If it fails:** Fix all type errors before proceeding. Common causes:
- Missing type annotations on new public APIs
- Incompatible types after dependency updates
- `noUncheckedIndexedAccess` violations on bracket access

---

### Step 2: ESLint

```bash
npm run lint
```

- [ ] Command exits with code 0
- [ ] Zero errors
- [ ] Zero warnings

**Expected output:** Clean exit with no output, or a summary showing `0 problems`.

**If it fails:** Run the auto-fixer first, then address remaining issues manually:

```bash
npm run lint:fix
```

---

### Step 3: Run Tests

```bash
npm test
```

- [ ] Command exits with code 0
- [ ] All test suites pass
- [ ] All individual tests pass
- [ ] No skipped tests (unless intentionally marked)

**Expected output:** Vitest summary showing all tests passed. Test files are located in `tests/**/*.test.ts`.

**If it fails:** Do not commit. Fix the failing tests or update them if behavior changed intentionally.

---

### Step 4: Build

```bash
npm run build
```

- [ ] Command exits with code 0
- [ ] `dist/` directory is generated
- [ ] No build warnings

**Expected output:** tsup build output showing successful compilation.

**If it fails:** Common causes:
- Import/export issues not caught by `tsc --noEmit`
- Missing or circular dependencies
- tsup configuration problems

---

### Step 5: Validate README Counts

```bash
python3 scripts/validate_counts.py
```

- [ ] Command exits with code 0
- [ ] All counts match (MCP tools, CLI commands, templates, error classes, test files, bundle size)

**If it fails:** Update the relevant counts in `README.md` to match the actual source code. Common causes:
- Added or removed a test file without updating test file count
- Added a new MCP tool, CLI command, or error class
- Bundle size changed significantly after dependency updates

---

### Step 6: Version Sync (package.json ↔ package-lock.json)

If the commit touches `package.json`, `package-lock.json` must match the same
`version` field. An out-of-sync lockfile breaks `npm ci` in CI and the publish
workflow, producing a failed release.

```bash
node -e "const a=require('./package.json').version, b=require('./package-lock.json').version; if (a!==b) { console.error('MISMATCH: package.json='+a+' package-lock.json='+b); process.exit(1) } console.log('OK: '+a)"
```

- [ ] Exit code 0
- [ ] Output: `OK: X.Y.Z`
- [ ] No `MISMATCH` error

**If it fails:** re-run `npm install --package-lock-only` to regenerate the
lockfile, then stage it with the release commit.

---

### Step 7: Secret scan

Manually verify that no secrets are staged for commit.

```bash
git diff --cached --name-only
```

- [ ] No `credentials.json` files staged
- [ ] No `.env` or `.env.*` files staged
- [ ] No files containing API tokens, passwords, or Jira credentials
- [ ] No `NODE_AUTH_TOKEN` or `NPM_TOKEN` values in code

**Verify no hardcoded secrets in changed files:**

```bash
git diff --cached -S "token" -S "password" -S "secret" -S "api_key" --name-only
```

- [ ] Any matches are false positives (variable names, type definitions) not actual secrets

---

### Step 8: Conventional Commit Message

Verify your commit message follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

| Type | Use |
|------|-----|
| `feat` | New MCP tool, resource, or feature |
| `fix` | Bug fix |
| `refactor` | Code improvement without behavior change |
| `docs` | Documentation-only change |
| `test` | Test-only change |
| `chore` | Build process, CI, dependencies |

- [ ] Commit message starts with a valid type prefix
- [ ] Subject line is under 72 characters
- [ ] Description starts with a lowercase verb
- [ ] One logical change per commit
- [ ] No `WIP` commits in the final PR

**Examples:**

```
feat: add get-sprint-tasks tool
fix: handle Jira 429 rate-limit response
refactor: extract JQL builder into utility
test: add integration tests for sync_tasks
```

---

### Step 9: Branch Naming

Verify your branch name follows the project convention:

- [ ] Branch name uses a valid prefix from the table below
- [ ] Branch name uses kebab-case after the prefix

| Prefix | Use |
|--------|-----|
| `feat/` | New MCP tool, resource, or feature |
| `fix/` | Bug fix |
| `refactor/` | Code improvement without behavior change |
| `docs/` | Documentation-only change |
| `test/` | Test-only change |

**Check current branch:**

```bash
git branch --show-current
```

- [ ] Output matches pattern: `(feat|fix|refactor|docs|test)/<kebab-case-description>`

---

## CI Parity

This checklist mirrors the CI jobs defined in `.github/workflows/ci.yml`:

| CI Job | Local Command | What It Checks |
|--------|---------------|----------------|
| TypeScript compile check | `npm run typecheck` | `tsc --noEmit` with strict mode |
| ESLint | `npm run lint` | Linting of `src/` and `tests/` |
| Tests (ubuntu + macOS) | `npm test` | Vitest test suite |
| Build | `npm run build` | tsup compilation to `dist/` |
| Validate counts | `python3 scripts/validate_counts.py` | README.md counts match source code |
| Required files check | Manual | LICENSE, CHANGELOG.md, SECURITY.md, CODE_OF_CONDUCT.md, README.md exist |

---

## Checklist Summary

| # | Step | Command | Pass Criteria |
|---|------|---------|---------------|
| 1 | TypeScript type check | `npm run typecheck` | 0 errors |
| 2 | ESLint | `npm run lint` | 0 errors, 0 warnings |
| 3 | Tests | `npm test` | All pass |
| 4 | Build | `npm run build` | Clean build |
| 5 | Validate README counts | `python3 scripts/validate_counts.py` | All counts match |
| 6 | Version sync | `node -e` check on `package.json` vs `package-lock.json` | Versions match |
| 7 | Secret scan | `git diff --cached` | No secrets staged |
| 8 | Commit message | Manual review | Conventional commit format |
| 9 | Branch naming | `git branch --show-current` | Valid prefix |
