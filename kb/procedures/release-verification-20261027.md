---
title: "Release verification: 1.18.0 and 1.18.1"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, visibility, internal-notes, service-management, confluence]
version: "1.18.1"
created: "2026-10-27"
last_updated: "2026-10-27"
description: "Executed record of 1.18.0 (comment and worklog visibility, Service Management internal notes, the default_comment setting) and the 1.18.1 docs patch it needed for get_page's hasStorageMarkup: gates, publish verification, live checks against DevOps, the KAN outage that delayed Phase 4, and the full run against KAN once it was back."
---

# Release verification: 1.18.0 and 1.18.1

Executed on 2026-10-27, following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

**1.18.0** (minor, both packages; only Jira changes):

- `visibility` on `add_task_comment`, `add_templated_comment` and
  `log_task_time`: a project role, or a group by name or by id.
- `internal` on the two comment tools: a Jira Service Management internal
  note, stored as the `sd.public.comment` comment property. Refused with
  `INVALID_INPUT` outside a `service_desk` project, where Jira would keep the
  property and still show the comment to everyone.
- `default_comment`, global (`config set-comment-default`) and per project
  (`config set-project-comment-default`): what a comment without an explicit
  `internal` becomes in a service project. Neither set means `public`, the
  behaviour before 1.18.0, so upgrading changes nothing.
- `get_task_details` returns `visibility` and `internal` on every comment;
  `internal` comes from `GET /issue/{key}/comment?expand=properties`.

Commits `8d83aff` (feature), `af84793` (release), tag `v1.18.0`.

**1.18.1** (patch, docs only): found by this run, see
[Confluence finding](#confluence-finding). Commits `ce6d586` (fix),
`02a3258` (release).

## Design decisions made on the way

- **Internal notes are not `visibility`.** The first cut only had
  `visibility`. In a service project the "Internal note" button leaves
  `visibility` empty and sets `sd.public.comment`, so a role restriction would
  have been read back as a public comment.
- **The fallback is public.** An internal default was proposed and dropped:
  the package is public, and every service desk that replies to customers
  through an agent would silently stop reaching them after an upgrade, with no
  error because the comment still saves.
- **No role cache.** Statuses are not cached for the MCP tools either
  (`get_task_statuses` reads live; the workflow and user caches are CLI only).
  Jira validates role and group names on the write.
- **The project type is cached per connector.** Every comment needs it, and it
  practically never changes. A failed lookup is not remembered.

## Gates (`npm run release -- 1.18.0`)

| Gate | Result |
|---|---|
| typecheck, lint | 0 errors |
| `test:coverage` | 92 files, 1234 tests; 86.56% lines, 75.01% branches, 88.74% functions |
| Linux (`node:22`, non-root) | 1234 passed |
| build, licence banner, `validate_counts.py --full`, publish workflow | ok |
| pack and smoke install | ok |
| Publish run 40481823563 | green; both packages on npm with SLSA v1 provenance; GitHub Release created |

`npm ci` in the gate log reports 19 advisories in the development tree
(1 critical). The published packages are clean: `npm install` of both into a
throwaway project reports 0 vulnerabilities.

## Live checks before the release

Run from the local source against `spyrosoftecommerce.atlassian.net`:

- DEVOPS is `software`. None of the 37 configured projects is `service_desk`
  (34 `software`, MPO `product_discovery`, WYC `business`).
- `internal: true` on DEVOPS-49 answered `INVALID_INPUT` before any POST.
- `GET /issue/DEVOPS-49/comment?expand=properties` carries a `properties`
  array on every comment; without `expand` the field is absent. So the read
  path is real, even though no comment there had `sd.public.comment`.
- A comment restricted to the DEVOPS role `Internal` was posted on DEVOPS-26 at
  the maintainer's request. Jira stored
  `{type: role, value: Internal, identifier: Internal}`; the maintainer
  confirmed it was hidden and deleted it.

**Not verified anywhere:** that `sd.public.comment` with `{"internal": true}`
hides a comment from a customer on the portal. No service project was
available. The key comes from Atlassian's own convention, not from the KB or
the API reference.

## Post-release run (1.18.0)

Against the globally installed 1.18.0 binaries, over stdio JSON-RPC.

| Phase | Result |
|---|---|
| 1 Install | both binaries at 1.18.0 |
| 2 CLI | `--help` lists both new commands; `list-projects` shows the `SD COMMENTS` column |
| 3 Server | 23 tools, equal to `definitions.ts`; `add_task_comment` has `visibility` and `internal`, `log_task_time` has `visibility` |
| 4 Live Jira (KAN) | first attempt blocked: softspark.atlassian.net answered 503, subscription deactivated. Run after the maintainer reactivated it, see below |
| 4b Live Confluence (DevOps) | 4b.1, 4b.3 to 4b.9 ok; `MARKUP_LOSS_REFUSED` with the page version unchanged; `ANCHOR_NOT_FOUND` on a missing anchor. 4b.2 checked with `all_formats: true` only |
| 5 Supply chain | `PROVENANCE OK` on both; `npm audit signatures`: 3 registry signatures, 2 attestations verified |

### Phase 4 on KAN

KAN-16, all steps passed: created, read, updated, commented in markdown and
from `status-update`, moved to `W toku`, reassigned and unassigned, 15m logged,
synced with the explicit JQL, read from cache with `creator` and `reporter`,
found by search, moved to `Gotowe`.

New in 1.18.0, on the same task:

| Call | Result |
|---|---|
| `add_task_comment` with `visibility: {type: role, value: Administrator}` | stored as `{type: role, value: Administrator, identifier: Administrator}` |
| `add_task_comment` with `internal: true` (KAN is `software`) | `INVALID_INPUT`, no comment created |
| `log_task_time` with the same `visibility` | stored |
| `get_task_details` read-back | 3 comments; only the third restricted; all `internal: false` |

The first script run created KAN-16 and then stopped: it read `task_key` from
the `create_task` result, which answers `issue_key`. The second run reused
KAN-16 instead of creating a duplicate. KAN-16 is left in `Gotowe` with the
`smoke-test` label and two 15m worklogs.

Step 4b.7's write half was skipped: the default space is a client's.

## Confluence finding

`get_page` returns `page.hasStorageMarkup`. Its tool description,
`rules/confluence-mcp.md`, the README, `kb/reference/confluence.md` and this
SOP said `has_storage_markup`, a field that never existed. An agent following
the docs could not tell a macro-bearing page in advance. Pages stayed safe,
because `update_page` refuses markdown over one either way (verified live in
4b.6).

The docs were fixed rather than the field renamed: every other field on
`page` is camelCase (`spaceId`, `parentId`, `bodyFormat`), and renaming would
break callers that already read it. A test in
`packages/confluence-mcp/tests/confluence/page-operations.test.ts` now ties
the description to the returned field. Released as 1.18.1.

## 1.18.1

| Check | Result |
|---|---|
| `npm run release -- 1.18.1` | all gates green on macOS and Linux, 1235 tests; tag `v1.18.1` on `02a3258` |
| Publish run 40488765807 | green in 44s; both packages on npm with provenance; GitHub Release created |
| 1 Install | both binaries at 1.18.1 |
| 3 Server | Jira: 23 tools, the 1.18.0 refusals still answer `INVALID_INPUT` and write nothing. Confluence: 31 tools; the `get_page` description names `page.hasStorageMarkup` |
| 4b Live Confluence (DevOps) | 4b.1 to 4b.9 as in 1.18.0; the page read carries `hasStorageMarkup: true` and no `has_storage_markup` |
| 5 Supply chain | `PROVENANCE OK` on both; 3 registry signatures, 2 attestations verified |

The release script ran from the maintainer's shell: in the agent session the
auto mode classifier refused the tag-push-publish step, and the agent did not
look for a way around it. Phase 4 was not repeated, since Jira did not change.

## Outstanding

- `~/.claude/rules/ai-toolkit-registered-jira-mcp.md` already carries the new
  visibility and internal-note rules. The Confluence copy still says
  `has_storage_markup` until `rules/confluence-mcp.md` is registered again with
  `ai-toolkit add-rule`; the same holds for `.github/instructions/`.
- Internal notes need one live check on a real service project.
