---
title: "SOP: Release Creation"
category: procedures
service: jira-mcp
tags: [sop, release, version, publish, changelog, semver, npm, tag]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Step-by-step release procedure for @softspark/jira-mcp — version bump, changelog, quality gates, tagging, npm publish via CI, and rollback instructions."
---

# SOP: Release Creation

Complete procedure for preparing and publishing a new `@softspark/jira-mcp` release.
Run this **before** tagging. After CI publishes, run the
[Post-Release Testing SOP](sop-post-release-testing.md) to verify.

**Pipeline:**
```
Release Creation (this SOP) --> git tag --> CI publish --> Post-Release Testing SOP
```

**Time:** 5-10 minutes

---

## Quick Checklist (TL;DR)

```bash
# 1. Decide version bump (patch / minor / major)
# 2. Edit package.json "version" field
# 3. Write CHANGELOG.md entry
# 4. Run quality gates
npm run typecheck && npm run lint && npm test && npm run build
# 4.5. Validate README counts match source
python3 scripts/validate_counts.py
# 5. Commit
git add package.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
# 6. Tag and push
git tag vX.Y.Z
git push origin main --tags
# 7. Verify: npm view @softspark/jira-mcp version
```

---

## Phase 1: Determine Version Bump

Follow [Semantic Versioning](https://semver.org/):

| Change Type | Bump | Examples |
|-------------|------|---------|
| Bugfix, typo, doc-only | **patch** | Fix error handling, correct README |
| New MCP tool, feature, resource | **minor** | Add `get-sprint-tasks` tool, add caching layer |
| Breaking API change, removed tool, config format change | **major** | Rename tool schema, remove `sync_tasks` |

- [ ] Version bump type decided: patch / minor / major
- [ ] New version number determined: `X.Y.Z`

**Rule:** When in doubt, bump minor.

---

## Phase 2: Update Version

Edit `package.json` and set the `"version"` field to the new version:

```bash
# Open package.json and update the version field
# "version": "X.Y.Z"
```

- [ ] `package.json` `"version"` field updated to `X.Y.Z`

**Verify:**

```bash
node -e "console.log(require('./package.json').version)"
```

- [ ] Output matches target version `X.Y.Z`

---

## Phase 3: Write CHANGELOG Entry

Add an entry at the top of `CHANGELOG.md`, below the header and above `[Unreleased]`:

```markdown
## vX.Y.Z -- Short Title (YYYY-MM-DD)

### Added
- **Feature name** -- verb-start description

### Changed
- **What changed** -- old behavior to new behavior

### Fixed
- **Bug description** -- what was broken and how it is fixed

### Removed
- **What was removed** -- migration path if any
```

**Rules:**
- [ ] Entry placed after the header, before previous entries
- [ ] Format: `## vX.Y.Z -- Short Title (YYYY-MM-DD)`
- [ ] Only include sections that have content (Added, Changed, Fixed, Removed)
- [ ] Feature names in **bold**
- [ ] Descriptions start with a verb
- [ ] Tool names in backticks: `sync_tasks`
- [ ] Date format: `YYYY-MM-DD`

---

## Phase 4: Run Quality Gates

Run the full CI-equivalent pipeline locally:

### Step 4.1: TypeScript Type Check

```bash
npm run typecheck
```

- [ ] Exit code 0
- [ ] Zero type errors

### Step 4.2: ESLint

```bash
npm run lint
```

- [ ] Exit code 0
- [ ] Zero errors, zero warnings

### Step 4.3: Tests

```bash
npm test
```

- [ ] Exit code 0
- [ ] All test suites pass
- [ ] All individual tests pass

### Step 4.4: Build

```bash
npm run build
```

- [ ] Exit code 0
- [ ] `dist/` directory generated successfully

**One-liner:**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

- [ ] All four commands pass with zero errors

### Step 4.5: Validate Counts

Verify that README.md counts (MCP tools, CLI commands, templates, error classes,
test files, bundle size) match the actual source code. This prevents count drift
that erodes trust in documentation.

```bash
python3 scripts/validate_counts.py
```

- [ ] Exit code 0
- [ ] All counts match source code

For a full check including live test count verification:

```bash
python3 scripts/validate_counts.py --full
```

> **Pattern:** Same approach as ai-toolkit `validate.py`. Counts are allowed
> ONLY in `README.md` (single source of truth). All other docs use relative
> language ("all tools", "built-in templates"). See `scripts/validate_counts.py`.

**If counts are out of sync:** Update `README.md` to match actual values.
Do NOT update source code to match README — source is always authoritative.

**If any step fails:** Fix the issue. Do NOT proceed with the release.

---

## Phase 5: Commit Release

Stage only the release files:

```bash
git add package.json CHANGELOG.md
```

Commit with the conventional commit format:

```bash
git commit -m "chore: release vX.Y.Z"
```

- [ ] Only `package.json` and `CHANGELOG.md` are staged
- [ ] Commit message follows format: `chore: release vX.Y.Z`
- [ ] Working tree is clean after commit

**Verify:**

```bash
git log --oneline -1
```

- [ ] Latest commit shows `chore: release vX.Y.Z`

---

## Phase 6: Tag and Push

Create an annotated tag and push:

```bash
git tag vX.Y.Z
git push origin main --tags
```

- [ ] Tag `vX.Y.Z` created locally
- [ ] Push to `origin main` succeeds
- [ ] Tag pushed to remote

This triggers `.github/workflows/publish.yml` which:
1. Checks out the tag
2. Runs `npm ci` and `npm run build`
3. Publishes to npm as `@softspark/jira-mcp@X.Y.Z` (public access)
4. Creates a GitHub Release with auto-generated release notes

---

## Phase 7: Verify Publish

Wait for the CI publish workflow to complete (1-2 minutes), then verify:

### Step 7.1: npm Registry

```bash
npm view @softspark/jira-mcp version
```

- [ ] Output shows `X.Y.Z`

### Step 7.2: npm Package Contents

```bash
npm view @softspark/jira-mcp dist.tarball
```

- [ ] Tarball URL is accessible

### Step 7.3: GitHub Release

```bash
gh release view vX.Y.Z --repo softspark/jira-mcp
```

- [ ] Release exists for tag `vX.Y.Z`
- [ ] Release notes are populated

### Step 7.4: Run Post-Release Testing

After verification, run the full [Post-Release Testing SOP](sop-post-release-testing.md).

- [ ] Post-release smoke tests pass

---

## Rollback

If a bad release was published:

### Option A: Deprecate (Preferred)

Deprecation does not break existing installs but warns users:

```bash
npm deprecate "@softspark/jira-mcp@X.Y.Z" "Known issue: <description>. Use vA.B.C instead."
```

- [ ] Deprecation message set on npm

### Option B: Unpublish (Within 72 Hours)

Only use if the release contains a critical security issue:

```bash
npm unpublish @softspark/jira-mcp@X.Y.Z
```

- [ ] Package version removed from npm

### Delete the Tag

Remove the tag from both local and remote:

```bash
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z
```

- [ ] Local tag deleted
- [ ] Remote tag deleted

### Delete the GitHub Release

```bash
gh release delete vX.Y.Z --repo softspark/jira-mcp --yes
```

- [ ] GitHub Release deleted

### Fix and Re-release

1. Fix the issue on `main`
2. Bump to next patch version (e.g., `X.Y.Z+1`)
3. Re-run this SOP from Phase 1

---

## Checklist Summary

| # | Phase | Action | Pass Criteria |
|---|-------|--------|---------------|
| 1 | Version bump | Decide patch/minor/major | Type selected |
| 2 | Update version | Edit `package.json` | Version matches target |
| 3 | CHANGELOG | Add release entry | Entry exists with correct format |
| 4a | Typecheck | `npm run typecheck` | 0 errors |
| 4b | Lint | `npm run lint` | 0 errors, 0 warnings |
| 4c | Test | `npm test` | All pass |
| 4d | Build | `npm run build` | Clean build |
| 4e | Validate counts | `python3 scripts/validate_counts.py` | All counts match |
| 5 | Commit | `git commit` | Clean working tree |
| 6 | Tag and push | `git tag` + `git push` | CI triggered |
| 7 | Verify | `npm view` + GitHub | Correct version published |
