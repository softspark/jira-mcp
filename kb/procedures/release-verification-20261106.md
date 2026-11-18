---
title: "Release verification: 1.19.0"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, mentions, adf, confluence]
version: "1.19.0"
created: "2026-11-06"
last_updated: "2026-11-06"
description: "Executed record of 1.19.0 (user mentions in Jira comments and descriptions via @email and [~accountid:ID], mention-preserving ADF reads in both servers): gates, publish verification, the full Phase 4 run on KAN with live mention checks, and the read-only Confluence run on DevOps."
---

# Release verification: 1.19.0

Executed on 2026-11-06, following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

**1.19.0** (minor, both packages):

- `markdownToAdf` turns `[~accountid:ID]` and `[Label|~accountid:ID]` into an
  ADF `mention`. Before this the converter had no mention node at all, so every
  `@Name` in a comment reached Jira as text and notified nobody.
- Jira resolves `@email` to an account id (`/user/search`, once per address)
  in `add_task_comment`, `add_templated_comment` and the `description` of
  `create_task` and `update_task`. An unknown address fails the call before
  anything is posted. Code spans, fenced blocks and `\@` stay literal.
- `adfToMarkdown` renders a mention as `[@Name|~accountid:ID]` instead of a
  bare `@Name`, so a read-modify-write keeps it. This covers `get_page` in
  markdown as well.

Commits `35bbfe8` (fix), `9aa4865` (release), tag `v1.19.0`.

## Release

| Check | Result |
|---|---|
| `npm run release -- 1.19.0 --dry-run` | steps 1-5 green on macOS and Linux, 1255 tests |
| `npm run release -- 1.19.0` | run from the maintainer's shell (the auto mode classifier refused the tag-push-publish step in the agent session, as for 1.18.1); tag `v1.19.0` on `9aa4865` |
| Publish run 42175981430 | green in 1m2s; both packages on npm with provenance; GitHub Release created |

## Post-release testing

Against the globally installed 1.19.0 binaries, over stdio JSON-RPC (the
session's own MCP server was still the 1.18.2 binary).

| Phase | Result |
|---|---|
| 1 Install | both binaries at 1.19.0 |
| 2 CLI | `--help` ok; `list-projects` shows KAN, `pl` |
| 3 Server | Jira 23 tools, Confluence 31; startup clean |
| 4 Live Jira (KAN) | KAN-17, 4.1 to 4.15 all passed; status names from `get_task_statuses` (`W toku`, `Gotowe`) |
| 4b Live Confluence (DevOps) | 4b.1 to 4b.9 ok on page 978092034: `MARKUP_LOSS_REFUSED` with version 2 unchanged; `ANCHOR_NOT_FOUND`; explicit `body_format: markdown` overrides the storage space. 4b.7 write skipped, the default space is a client's |
| 5 Supply chain | `PROVENANCE OK` on both; 3 registry signatures, 2 attestations verified |
| 6 Cleanup | KAN-17 in `Gotowe` with the `smoke-test` and `updated` labels, one 15m worklog |

### Mentions on KAN-17

| Call | Result |
|---|---|
| `update_task` description with `@biuro@softspark.eu` | stored as a mention; read back as `[@softspark|~accountid:557058:a23561fb-...]` |
| `add_task_comment` with `@biuro@softspark.eu` and the same address in backticks | first one a mention, Jira filled `text: "@softspark"`; the code span stayed text |
| `add_task_comment` with an unknown address | `User not found for email: ...`, code `JIRA_CONNECTION`; no comment created |
| `add_task_comment` pasting `[@softspark|~accountid:...]` from the read | stored as the same mention |

## Outstanding

- The only account on KAN is the token's own, and Jira does not notify you of
  your own mention. That a mention of someone else sends a notification is
  not verified live; the stored node is the same one the Jira editor writes.
- `findUser` takes the first hit of a fuzzy `/user/search`, for mentions as for
  assignees. An address that matches more than one user can tag the wrong one.
  Tightening it changes `assignee_email` too, so it waits for a decision.
- An unknown address answers `JIRA_CONNECTION`, although it is the caller's
  input that is wrong (`INVALID_INPUT` would fit). Same reason as above.
