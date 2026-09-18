---
title: "Release verification: 1.16.0"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, creator, reporter]
version: "1.16.0"
created: "2026-09-18"
last_updated: "2026-09-18"
description: "Executed record of the 1.16.0 release (creator and reporter on every task read): gates, publish verification, a 6 minute registry propagation, and the full post-release run against KAN and DevOps."
---

# Release verification: 1.16.0

Executed on 2026-09-18, following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

**1.16.0** adds `creator` and `reporter` to `search_tasks`, `get_task_details`,
`sync_tasks` and `read_cached_tasks`. It came from a user report: an agent asked
who had raised a set of bugs found that neither tool returned the field, and
tried to reach the raw Jira REST API through a browser instead. The connector
had fetched `creator` all along, but only for the `delete_task` ownership guard,
and it never asked Jira for `reporter`.

Minor bump: new response fields, nothing removed or renamed. Both packages
bumped together per
[ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md);
`@softspark/confluence-mcp` has no behaviour change, and its bundle differs from
1.15.0 only by the version string.

The cache schema gives both fields a `null` default, so a cache file written by
1.15.0 still loads and `CACHE_VERSION` stays `1.0`.

Feature commit `f4ef663`, release commit `8dfb76c`, tag `v1.16.0` (annotated).

## Phases 1 to 4.7: gates

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 85 files, 1102 tests (was 1093) |
| `npm run test:coverage` | 86.1% lines, 73.6% branches, 88.3% functions |
| `npm run build` | both packages, `dist/index.js` 562 KiB |
| `validate_counts.py` | 21 tools, 24 CLI commands, 8 templates, 30 error classes, 85 test files, badge 1.16.0 |
| Supply-chain greps | `--provenance` and `id-token: write` present |
| Licensing | 9 assertions green, banner in both bundles |
| `npm audit --omit=dev` | 0 vulnerabilities (the 15 that plain `npm audit` reports are all under `vite`, a dev dependency) |

Before the feature commit, the locally built server was run over stdio against
KAN, read-only, and all four tools returned both fields.

## Phase 7: publish verification

| Check | Result |
|---|---|
| Publish workflow 35345377575 | green in 39s, both Publish steps signed provenance |
| GitHub release | v1.16.0, not a draft, auto-generated notes |
| `npm view @softspark/jira-mcp version` | 1.16.0 |
| `npm view @softspark/confluence-mcp version` | 1.16.0 |
| Provenance (`slsa.dev/provenance/v1`) | OK on both packages |
| `npm audit signatures` (throwaway project) | 3 verified registry signatures, 2 verified attestations |

Registry propagation again: publish finished 12:34:49 UTC, `npm view` still
answered 1.15.0 and both tarballs 404 at 12:35, and both turned 200 at 12:40:44.
Six minutes this time, both packages together. Polling was the whole fix, as in
[common-issues](../troubleshooting/common-issues.md#npm-404-on-a-version-that-was-just-published).

## Post-release run

Run from a configured machine, against the globally installed 1.16.0 binaries,
driven over stdio JSON-RPC.

| Phase | Result |
|---|---|
| 1 Install | `jira-mcp` and `confluence-mcp` at 1.16.0, global npm bin, no `MISSING` or `INVALID` |
| 2 CLI | `--help` lists every subcommand; `config list-projects` shows KAN, `pl` |
| 3 Server | `serverInfo` 1.16.0; the 21 tool names equal the ones in `definitions.ts` |
| 4 Live Jira (KAN) | KAN-14 created, read, updated, commented twice, moved to `W toku`, reassigned and unassigned, 15m logged, synced, read from cache, found by search, moved to `Gotowe` |
| 4 New fields | `get_task_details`, `read_cached_tasks` and `search_tasks` all returned `creator` and `reporter` for KAN-14 |
| 4b Live Confluence (DevOps) | space language and format, templates, search, page read as markdown and as storage, comments, labels, attachments: all OK |
| 4b.6 Markup guard | markdown `update_page` on "DevOps Home" refused with `MARKUP_LOSS_REFUSED`; the page stayed at version 29 |
| 4b.8 Inline anchor | text not on the page refused, no comment created |
| 5 Supply chain | provenance and signatures verified, see above |
| 6 Cleanup | KAN-14 left in `Gotowe` with the `smoke-test` label; both binaries kept installed |

### Not run

Step 4b.7's write half (`add_page_comment`) was skipped. DevOps is a working
space, not a sandbox, a new comment notifies the page's watchers, and the
Confluence bundle in this release is 1.15.0's plus a version string. The read
half (`get_page_comments`) ran.

### What the run caught in the SOP

Steps 4.13 and 4.14 do not work in the order written. `sync_tasks` with no `jql`
syncs `assignee = <me>`, and step 4.10 has just unassigned the test task, so the
sync reported 0 tasks and `read_cached_tasks` answered "not found in cache".
With `jql: "project = KAN ORDER BY updated DESC"` the sync pulled 5 tasks and
the cached row came back with the `Gotowe` status and both new fields. The SOP
step now passes that JQL.

One smaller thing, left alone because it is outside this release: the inline
anchor refusal in `confluence-mcp` answers with code `UNKNOWN_ERROR`. The
message is right, but the error is not a typed `JiraMcpError` subclass, so a
client cannot match on the code.
