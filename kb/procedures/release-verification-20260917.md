---
title: "Release verification: 1.15.0"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, tempo]
version: "1.15.0"
created: "2026-09-17"
last_updated: "2026-09-17"
description: "Executed record of the 1.15.0 release (Tempo worklogs and reports): gates, publish verification, the 13 minute registry propagation, and which post-release phases ran on a machine without a live Jira configuration."
---

# Release verification: 1.15.0

Executed on 2026-09-17, following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

**1.15.0** adds two read-only tools, `search_tempo_worklogs` and
`get_tempo_report`, backed by the Tempo Cloud REST API v4, plus
`jira-mcp config set-tempo-token`. Minor bump: new MCP tools. Both packages
bumped together per
[ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md);
`@softspark/confluence-mcp` has no behaviour change and only bundles the shared
HTTP client's new Bearer support.

Feature commit `afab1d7`, release commit `5c559f6`, tag `v1.15.0` (annotated,
signed; `tag.gpgSign` is on in this checkout, so a bare `git tag vX.Y.Z` fails
with "no tag message" and the SOP's tag line needs `-a -m`).

## Phases 1 to 4.7: gates

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 85 files, 1093 tests (was 80 / 991) |
| `npm run test:coverage` | 86.1% lines, 73.7% branches, 88.3% functions |
| `npm run build` | both packages, `dist/index.js` 561 KiB |
| `validate_counts.py` | 21 tools, 24 CLI commands, 8 templates, 30 error classes, 85 test files, badge 1.15.0 |
| Supply-chain greps | `--provenance` and `id-token: write` present |
| Licensing | 9 assertions green, banner in both bundles |

Two SOP drifts fixed in `c328ee6` before the release commit: the licensing test
lives at `packages/jira-mcp/tests/licensing.test.ts` since the workspace split,
and the staging list named four files where a workspace release stages four
`package.json` files, the synced changelog copies, both READMEs and `dist/`.

## Phase 6: push

The global pre-push hook refused the first push: the active `gh` account was
`lemspyrosoft` and the SoftSpark workspace requires `softspark`.
`gh auth switch --user softspark` and the same push went through. Main
`171fbdf..5c559f6`, tag pushed by full ref.

## Phase 7: publish verification

| Check | Result |
|---|---|
| Publish workflow 35213006805 | green in 36s, including "Verify npm token" and both Publish steps |
| GitHub release | v1.15.0, not a draft, auto-generated notes |
| `npm view @softspark/jira-mcp version` | 1.15.0 |
| `npm view @softspark/confluence-mcp version` | 1.15.0 |
| Provenance (`slsa.dev/provenance/v1`) | OK on both packages |
| `npm audit signatures` (throwaway project) | 3 verified registry signatures, 2 verified attestations |

### Registry propagation took 13 minutes, and the packument lagged too

Polled every 20 s from 12:58, publish finished 12:56:

| Time | jira-mcp | confluence-mcp |
|---|---|---|
| 12:58 | `version` 1.14.5, tarball 404 | `version` 1.15.0, tarball 404 |
| 13:02:54 | | tarball 200 |
| 13:04:43 | `version` 1.15.0, tarball 404 | |
| 13:08:59 | tarball 200 | |

Two things the troubleshooting entry did not yet say. The packument itself can
lag: `npm view` reported the previous version for nine minutes after a
successful publish while the sibling package already showed the new one. And
the tarball window can be well past "several minutes": thirteen here. Nothing
was wrong; the run's own conclusion was the signal, and polling was the whole
fix.

## Post-release run

Executed from a machine with no `~/.softspark/jira-mcp/` and no KAN
credentials, so the run covers what does not need a live site.

| Phase | Result |
|---|---|
| 1 Install | `jira-mcp` and `confluence-mcp` at 1.15.0 in `~/.local/bin` |
| 1.4 Contents | `CHANGELOG.md` heads at v1.15.0 in both tarballs, 8 Polish locale files, both Tempo tool names present in `dist/index.js` |
| 2 CLI | `jira-mcp --help` lists `config set-tempo-token`; `confluence-mcp --help` intact |
| 3 Server | 21 tools over stdio (both Tempo tools listed), 31 Confluence tools; run under a throwaway `HOME` with a dummy config, and the real home stayed untouched |
| 3b Tempo guard | `get_tempo_report` on a site without `tempo_token` answers `TEMPO_NOT_CONFIGURED` with the fix in the message, and makes no network call |
| 4 Live Jira (KAN) | **not run here**: no configuration on this machine |
| 4b Live Confluence | **not run here**: same reason |
| 5 Supply chain | provenance and signatures verified, see above |

The stdio check under a throwaway `HOME` is worth keeping: `os.homedir()`
follows `$HOME`, so `HOME=<scratch> jira-mcp serve` reads a scratch config and
writes its cache there, and the maintainer's real `~/.softspark/` is never
touched by a smoke test.

## Outstanding

- Phase 4 and 4b against KAN and DevOps from a configured machine.
- A live Tempo call. Nothing in this release has hit `api.tempo.io`; the
  request shapes (`GET /4/worklogs` with repeated `issueId`/`projectId`,
  `GET /4/worklogs/user/{accountId}`) follow the v4 documentation and are
  unit-tested against a fake, not the service. First live report is the real
  test.
