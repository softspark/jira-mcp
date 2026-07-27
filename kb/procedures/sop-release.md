---
title: "SOP: Release Creation"
category: procedures
service: jira-mcp
tags: [sop, release, version, publish, changelog, semver, npm, tag, provenance, supply-chain]
version: "1.1.0"
created: "2026-04-13"
last_updated: "2026-07-27"
description: "Step-by-step release procedure for @softspark/jira-mcp — version bump, changelog, quality gates, supply-chain gates (provenance + id-token), tagging, npm publish via CI, and rollback instructions."
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
# 2. Edit package.json "version" field (and sync package-lock.json)
npm install --package-lock-only
# 3. Write CHANGELOG.md entry + update README "What's New" section
# 4. Run quality gates
npm run typecheck && npm run lint && npm test && npm run build
# 4.5. Validate README counts match source
python3 scripts/validate_counts.py
# 4.6. Supply-chain gates (v2.8.0+)
grep -q -- '--provenance' .github/workflows/publish.yml
grep -q 'id-token: write' .github/workflows/publish.yml
# 4.7. Licensing gate (v1.7.0+) -- headers, LICENSE, NOTICE, dist banner
npx vitest run tests/licensing.test.ts
# 5. Commit
git add package.json package-lock.json CHANGELOG.md README.md
git commit -m "chore: release vX.Y.Z"
# 6. Tag, assert, push
git tag vX.Y.Z
test "$(git rev-parse vX.Y.Z)" = "$(git rev-parse HEAD)" || { echo "FAIL: tag not on HEAD"; exit 1; }
git show --no-patch --format=%s vX.Y.Z | grep -qx "chore: release vX.Y.Z" || { echo "FAIL: tag not on release commit"; exit 1; }
git push origin main
git push origin refs/tags/vX.Y.Z   # single tag by full ref, never --tags
# 7. Verify: npm view @softspark/jira-mcp version + provenance attestation
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

Edit `package.json` and set the `"version"` field to the new version, then
re-sync `package-lock.json` so both files match. An out-of-sync lockfile breaks
`npm ci` in the publish workflow and fails the pre-tag sync check.

```bash
# 1. Edit package.json "version" field to "X.Y.Z"
# 2. Re-sync package-lock.json
npm install --package-lock-only
```

- [ ] `package.json` `"version"` field updated to `X.Y.Z`
- [ ] `package-lock.json` regenerated via `npm install --package-lock-only`

**Verify both files match:**

```bash
node -e "const a=require('./package.json').version, b=require('./package-lock.json').version; if (a!==b) { console.error('MISMATCH', a, b); process.exit(1) } console.log(a)"
```

- [ ] Output matches target version `X.Y.Z`
- [ ] No `MISMATCH` error

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

### Step 3.2: Update README "What's New" Section

Replace the "What's New in vOLD" section in `README.md` with the new version highlights:

```markdown
## What's New in vX.Y.Z

- **Highlight 1** -- short description.
- **Highlight 2** -- short description.
```

- [ ] Section title updated to `## What's New in vX.Y.Z`
- [ ] Bullet points reflect the most important changes from CHANGELOG
- [ ] Test/file counts match actual values (verified by `validate_counts.py`)

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

### Step 4.6: Supply-Chain Gates (v2.8.0+)

Every public npm release MUST ship with provenance attestation (SLSA v1).
Unsigned releases are a regression and will be re-published. Verify the
workflow file enforces both requirements before tagging:

```bash
grep -q -- '--provenance' .github/workflows/publish.yml && echo "OK: --provenance"
grep -q 'id-token: write' .github/workflows/publish.yml && echo "OK: id-token: write"
```

- [ ] `.github/workflows/publish.yml` publish step uses `npm publish --access public --provenance`
- [ ] Workflow `permissions:` block includes `id-token: write` (required for OIDC attestation)
- [ ] Both grep checks exit 0

**If either check fails:** Fix `.github/workflows/publish.yml` before tagging.
A tag pushed with a broken workflow produces an unsigned release that must be
deprecated and re-published.

---

## Phase 4.7: Licensing Gate (v1.7.0+)

The project is Apache-2.0. Attribution only counts if it reaches the artifact,
and for this package that is not automatic.

```bash
npx vitest run tests/licensing.test.ts
```

Eight assertions, and why each exists:

| Check | Fails when |
|---|---|
| The walker finds >100 source files | The file walk broke and every other assertion would pass vacuously |
| Every source file carries an SPDX header | A new `.ts` file was added without one |
| Every header names Apache-2.0 | A file was copied in from a differently-licensed source |
| `LICENSE` is the complete Apache 2.0 text | The file was truncated or replaced with a summary |
| `NOTICE` carries attribution, source URL and section 4(d) | The attribution mechanism was gutted |
| `LICENSE` and `NOTICE` both in `package.json` `files` | A NOTICE that never reaches the consumer cannot satisfy 4(d) |
| `package.json` declares Apache-2.0 | The manifest drifted from the licence |
| **Both build entries carry the licence banner** | The one that matters -- see below |

**Why the banner assertion is the important one.** npm ships `dist/`, not `src/`,
and the build runs with `minify: true`, which strips every comment. The SPDX
headers in `src/` never reach a consumer. The only attribution in the published
package comes from the `banner` in `tsup.config.ts`. Delete it and the package
ships with no licence marker at all, while typecheck, lint, tests and build all
stay green. Verify by hand after a build if you touched the bundler config:

```bash
npm run build && grep -c 'Apache-2.0' dist/index.js dist/cli.js   # expect 1 and 1
```

The banner sits just after the hoisted ESM imports rather than on line 1 -- that
is normal esbuild behaviour for this format, not a defect.

**Adding source files?** Header after any shebang, `//` comments:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp
```

Full convention: [Licensing](../reference/licensing.md).

---

## Phase 5: Commit Release

Stage only the release files (lockfile included — see Phase 2):

```bash
git add package.json package-lock.json CHANGELOG.md README.md
```

Commit with the conventional commit format:

```bash
git commit -m "chore: release vX.Y.Z"
```

- [ ] `package.json`, `package-lock.json`, `CHANGELOG.md`, and `README.md` are staged
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

# Assert before pushing. Both checks are one line and both have caught a real
# broken release in a sibling repository on the same day.
test "$(git rev-parse vX.Y.Z)" = "$(git rev-parse HEAD)" \
  || { echo "FAIL: tag is not on HEAD"; exit 1; }
git show --no-patch --format=%s vX.Y.Z | grep -qx "chore: release vX.Y.Z" \
  || { echo "FAIL: tag is not on the chore: release commit"; exit 1; }

git push origin main
git push origin refs/tags/vX.Y.Z
```

- [ ] Tag `vX.Y.Z` created locally
- [ ] Both assertions exit 0 **before** any push
- [ ] Push to `origin main` succeeds
- [ ] Single tag pushed by full ref

> **Never `git push --tags`.** It pushes every local tag at once, and GitHub
> suppresses tag-triggered workflow runs when many tags arrive in one push --
> the publish workflow silently does not fire and nothing reaches npm. This is
> not hypothetical: a `--tags` push carrying 37 tags is exactly how the sibling
> `rag-mcp` project skipped an image build. Push the single release tag by its
> full ref.
>
> **Assert the tag placement.** A tag landing on the commit *before* the release
> commit publishes the previous version's tree under the new version number, or
> fails on an already-published version. Both happened on 2026-07-27, in two
> different repositories, and both were found only after the fact.

This triggers `.github/workflows/publish.yml` which:
1. Checks out the tag
2. Runs `npm ci` and `npm run build`
3. Publishes to npm as `@softspark/jira-mcp@X.Y.Z` (public access) with `--provenance`
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

### Step 7.3: Provenance Attestation (v2.8.0+)

Verify that the release landed with a SLSA provenance attestation. Any public
`@softspark/*` package without one is treated as a regression.

```bash
npm view "@softspark/jira-mcp@X.Y.Z" --json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['dist']['attestations']['provenance']['predicateType']=='https://slsa.dev/provenance/v1'; print('PROVENANCE OK')"
```

- [ ] Output shows `PROVENANCE OK`
- [ ] No `AssertionError` or `KeyError`

**If attestation is missing:** the publish workflow did NOT emit provenance.
Deprecate this version (`npm deprecate`), fix `publish.yml`, bump patch, and
re-release.

### Step 7.4: GitHub Release

```bash
gh release view vX.Y.Z --repo softspark/jira-mcp
```

- [ ] Release exists for tag `vX.Y.Z`
- [ ] Release notes are populated

### Step 7.5: Run Post-Release Testing

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
| 2 | Update version | Edit `package.json` + `npm install --package-lock-only` | Versions match in both files |
| 3a | CHANGELOG | Add release entry | Entry exists with correct format |
| 3b | README | Update "What's New" section | Title + bullets match new version |
| 4a | Typecheck | `npm run typecheck` | 0 errors |
| 4b | Lint | `npm run lint` | 0 errors, 0 warnings |
| 4c | Test | `npm test` | All pass |
| 4d | Build | `npm run build` | Clean build |
| 4e | Validate counts | `python3 scripts/validate_counts.py` | All counts match |
| 4f | Supply-chain gates | `grep -q -- '--provenance'` + `grep -q 'id-token: write'` | Both exit 0 |
| 5 | Commit | `git commit` | Clean working tree |
| 6 | Tag and push | `git tag` + `git push` | CI triggered |
| 7a | Verify npm | `npm view` + GitHub | Correct version published |
| 7b | Verify provenance | `npm view --json` + assert `slsa.dev/provenance/v1` | Attestation present |
