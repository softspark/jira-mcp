---
title: "SOP: Release Creation"
category: procedures
service: jira-mcp
tags: [sop, release, version, publish, changelog, semver, npm, tag, provenance, supply-chain, local-gates]
version: "2.0.0"
created: "2026-04-13"
last_updated: "2026-09-24"
description: "Release procedure for @softspark/jira-mcp and @softspark/confluence-mcp under Local Release Gates, Publish-Only CI: version bump, changelog, rebuilt dist, then one command (npm run release -- X.Y.Z) that runs every gate on macOS and in a Linux container, tags, pushes and watches the publish-only workflow. Rollback included."
---

# SOP: Release Creation

Procedure for a new release of the Atlassian MCP workspace:
`@softspark/jira-mcp` and `@softspark/confluence-mcp`, one version, one tag.
Model: every test runs on the maintainer's machine, GitHub Actions only turns
the tag into npm packages and a GitHub Release (the shared SoftSpark standard
"Local Release Gates, Publish-Only CI", 2026-09-24). No workflow runs on branch
pushes or pull requests.

**Pipeline:**
```
Prepare the release commit on main (Phases 1-4)
      ↓
npm run release -- X.Y.Z   (gates → Linux → pack + smoke → tag → push → watch publish)
      ↓
Post-Release Testing SOP
```

**Time:** 5-10 minutes of preparation, then a few minutes of unattended gates.

---

## Quick Checklist (TL;DR)

```bash
# 0. On an up-to-date main
git switch main && git pull --ff-only
# 1. Decide the bump; set "version" in all four package.json files
npm install --package-lock-only
# 2. CHANGELOG.md "## vX.Y.Z -- Title (YYYY-MM-DD)" + "What's New in vX.Y.Z" in both package READMEs
# 3. Rebuild: dist/ and the per-package CHANGELOG copies are committed
npm run build
# 4. Commit the release on main
git add package.json package-lock.json packages/*/package.json CHANGELOG.md \
  packages/*/CHANGELOG.md packages/*/README.md packages/*/dist
git commit -m "chore: release vX.Y.Z"
# 5. Rehearse (optional: every gate, no tag)
npm run release -- X.Y.Z --dry-run
# 6. Release: gates, Linux run, pack + smoke, tag, push, watch publish, verify npm
npm run release -- X.Y.Z
# 7. Post-release testing SOP
```

`scripts/release.sh` is the only supported way to create a release tag. A tag
made by hand skipped the gates, and nothing on GitHub will catch that.

---

## Phase 1: Determine Version Bump

Follow [Semantic Versioning](https://semver.org/):

| Change Type | Bump | Examples |
|-------------|------|---------|
| Bugfix, typo, doc-only | **patch** | Fix error handling, correct README |
| New MCP tool, feature, resource | **minor** | Add `get-sprint-tasks` tool, add caching layer |
| Breaking API change, removed tool, config format change | **major** | Rename tool schema, remove `sync_tasks` |

**Rule:** When in doubt, bump minor.

**Both published packages share one version.** `@softspark/jira-mcp` and
`@softspark/confluence-mcp` are bumped together and released from one tag, so a
release that touches only one of them still bumps both. The semver decision is
the union: a breaking change in either is a major for both. This is why
`confluence-mcp` starts at 1.12.0 rather than the 1.0.0 the module template
mandates for a new module. See
[ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md); do not
"fix" the numbering without reading it.

Prepare the release on `main`, up to date with `origin/main`. There is no
release branch, no PR and no CI to wait for: the release script's gates are the
check.

---

## Phase 2: Update Version

Set `"version"` to `X.Y.Z` in all four `package.json` files (root, `packages/core`,
`packages/jira-mcp`, `packages/confluence-mcp`), then re-sync the lockfile:

```bash
npm install --package-lock-only
```

The release script checks all four manifests and the lockfile (`version` plus
the `packages[""]`, `packages/core`, `packages/jira-mcp` and
`packages/confluence-mcp` entries). An out-of-sync lockfile breaks `npm ci`.

---

## Phase 3: CHANGELOG and READMEs

Add an entry at the top of `CHANGELOG.md`, below the header and above the
previous release. The release script requires a heading starting with
`## vX.Y.Z `:

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
- Only include sections that have content (Added, Changed, Fixed, Removed)
- Feature names in **bold**, descriptions start with a verb
- Tool names in backticks: `sync_tasks`
- Date format: `YYYY-MM-DD`

Replace the "What's New in vOLD" section in **both** `packages/jira-mcp/README.md`
and `packages/confluence-mcp/README.md` with `## What's New in vX.Y.Z` (checked by
the script) and keep test/file counts right: `validate_counts.py --full` runs
as a gate.

---

## Phase 4: Rebuild and Commit

The version is injected at build time and `dist/` is committed, as are the
changelog copies `scripts/sync-changelog.mjs` writes into each package:

```bash
npm run build
git add package.json package-lock.json packages/*/package.json \
  CHANGELOG.md packages/*/CHANGELOG.md packages/*/README.md packages/*/dist
git commit -m "chore: release vX.Y.Z"
```

The subject must be exactly `chore: release vX.Y.Z`. The release script
rebuilds and fails if that changes any committed file, so stale `dist/` cannot
reach a tag.

---

## Phase 5: Run the Release

```bash
npm run release -- X.Y.Z --dry-run   # optional rehearsal, steps 1-5 only
npm run release -- X.Y.Z
```

Logs go to `${TMPDIR:-/tmp}/jira-mcp-release-X.Y.Z/<gate>.log`. The script
stops at the first failure and prints the tail of that gate's log.

| Step | What `scripts/release.sh` does |
|---|---|
| 1. Preconditions | Branch is `main`; tree clean; `git fetch` done and `origin/main` is an ancestor of `HEAD`; `X.Y.Z` is semver; `vX.Y.Z` exists neither locally nor on `origin`; neither package has `X.Y.Z` on npm yet |
| 2. Version and notes | The four manifests and five lockfile entries say `X.Y.Z`; CHANGELOG `## vX.Y.Z`; both package READMEs `What's New in vX.Y.Z`; `HEAD` subject `chore: release vX.Y.Z` |
| 3. Gates (macOS host) | Required files; `npm ci`; `npm run typecheck`; `npm run lint`; `npm run test:coverage` (includes the licensing test and the 70% coverage threshold); `npm run build`; licence banner in both `dist/index.js` and `dist/cli.js`; `validate_counts.py --full`; `publish.yml` still has `--provenance` and `id-token: write`; the gates left the tree unchanged |
| 4. Linux | The repository (tracked files plus `.git`, copied in, never mounted) into a throwaway `node:22` container: `npm ci` and `npm run test:coverage` as the unprivileged `node` user |
| 5. Build and smoke | `npm pack` of both workspaces; both tarballs installed into a scratch prefix with a scratch `HOME`; `jira-mcp --version` and `confluence-mcp --version` report `X.Y.Z`, `--help` runs |
| 6. Tag and push | Annotated tag `vX.Y.Z` (`tag.gpgSign` rejects a bare tag); asserts `vX.Y.Z^{commit}` is `HEAD` and its subject is `chore: release vX.Y.Z`; `git push origin main`; `git push origin refs/tags/vX.Y.Z` |
| 7. Watch publish | Finds the `publish.yml` run for the tagged commit, `gh run watch --exit-status`; `npm view` shows `X.Y.Z` with a SLSA v1 provenance attestation for both packages; the GitHub Release exists |

`--gates-only` runs steps 3-5 on the current working tree without any git
precondition and tags nothing.

### Why step 4 applies here

The code is plain Node, but the old CI ran the suite on Ubuntu and macOS, and
the difference is real: Linux has a case-sensitive filesystem and different
temp and home paths, which is exactly where the filesystem and config tests can
diverge. The container run costs about a minute.

### What the publish workflow still does

`.github/workflows/publish.yml`, on a `v*` tag only: checkout, Node 22 setup,
**tag equals the root, jira-mcp and confluence-mcp versions**, `npm ci`,
`npm run build`, `npm whoami`, `npm publish --access public --provenance` for
each workspace, GitHub Release. Actions are pinned by commit SHA. No test,
lint or count step: the tag exists only because the local gates passed.

**Provenance is non-negotiable.** Every public `@softspark/*` release ships with
a SLSA v1 attestation; the script's `publish-workflow` gate fails when
`--provenance` or `id-token: write` disappears, and step 7 fails when a
published version has no attestation.

### Licensing: why the banner gate matters

npm ships `dist/`, not `src/`, and the build runs with `minify: true`, which
strips every comment. The SPDX headers in `src/` never reach a consumer. The
only attribution in the published package comes from the `banner` in
`tsup.config.ts`. Delete it and the package ships with no licence marker at all,
while typecheck, lint, tests and build all stay green. The licensing test
(`packages/jira-mcp/tests/licensing.test.ts`, inside `test:coverage`) and the
`licence-banner` gate both catch it.

**Adding source files?** Header after any shebang, `//` comments:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp
```

Full convention: [Licensing](../reference/licensing.md).

### Postmortems the script encodes

- **Tag on the wrong commit** (two repositories, 2026-07-27): a tag on the
  commit before the release commit publishes the previous tree under the new
  number, or fails on an already-published version. Step 6 asserts the tag
  before pushing; the workflow asserts tag equals version.
- **`--tags` push**: GitHub suppresses tag-triggered runs when many tags arrive
  in one push (rag-mcp skipped an image build with 37 tags). The script pushes
  exactly one ref.
- **README claimed 1093 tests when there were 1102** (1.16.0): `validate_counts.py`
  without `--full` skips the test count. The gate always uses `--full`.

### If a gate fails

Fix the cause, amend or add to the release commit, run the script again. Do
not skip a gate and do not tag by hand. If step 7 fails, the tag is pushed:
read the run log (`gh run view <id> --log-failed`) and use Rollback when a
broken version reached npm.

**npm tarball 404 while the version and its metadata are present:** CDN
propagation, not a bad publish. See
[npm 404 on a version that was just published](../troubleshooting/common-issues.md#npm-404-on-a-version-that-was-just-published).

---

## Phase 6: Post-Release Testing

Run the full [Post-Release Testing SOP](sop-post-release-testing.md).

---

## Repository settings

Rulesets must not require status checks: the checks no longer exist, and a
required check that never reports blocks every merge. Releases push `main`
directly, which needs a rule set that lets the maintainer push (today the
`main protection` ruleset allows repository admins to bypass).

---

## Rollback

### Option A: Deprecate (Preferred)

```bash
npm deprecate "@softspark/jira-mcp@X.Y.Z" "Known issue: <description>. Use vA.B.C instead."
npm deprecate "@softspark/confluence-mcp@X.Y.Z" "Known issue: <description>. Use vA.B.C instead."
```

If only the first package published (the workflow publishes them in sequence),
deprecate the orphan and release a patch.

### Option B: Unpublish (Within 72 Hours)

Only for a critical security issue:

```bash
npm unpublish @softspark/jira-mcp@X.Y.Z
```

### Delete the Tag and the GitHub Release

Deleting a tag does not delete what was published.

```bash
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z
gh release delete vX.Y.Z --repo softspark/jira-mcp --yes
```

### Fix and Re-release

Fix the issue on `main`, bump to the next patch version, and re-run this SOP.

---

## Checklist Summary

| # | Phase | Action | Pass Criteria |
|---|-------|--------|---------------|
| 1 | Version bump | Decide patch/minor/major | Type selected |
| 2 | Update version | Four `package.json` files + `npm install --package-lock-only` | All say `X.Y.Z` |
| 3 | CHANGELOG + READMEs | Entry + `What's New in vX.Y.Z` in both package READMEs | Present |
| 4 | Rebuild + commit | `npm run build`, `git commit -m "chore: release vX.Y.Z"` | Clean tree |
| 5 | Rehearse | `npm run release -- X.Y.Z --dry-run` | Steps 1-5 green |
| 6 | Release | `npm run release -- X.Y.Z` | Exit 0: gates green on macOS and Linux, tag pushed, publish run green, both packages on npm with provenance, GitHub Release |
| 7 | Post-release | [Post-Release Testing SOP](sop-post-release-testing.md) | Pass |
