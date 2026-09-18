---
title: "Release verification: 1.16.1"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, error-codes, invalid-input]
version: "1.16.1"
created: "2026-09-18"
last_updated: "2026-09-18"
description: "Executed record of the 1.16.1 patch (argument checks answer INVALID_INPUT instead of UNKNOWN_ERROR): what the new guard test caught, a raw NUL byte that hid a source file from grep and git, gates, publish verification and the full post-release run against KAN and DevOps."
---

# Release verification: 1.16.1

Executed on 2026-09-18, the same day as [1.16.0](release-verification-20260918.md),
following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

The 1.16.0 post-release run noticed that the inline comment anchor refusal in
`confluence-mcp` answered `UNKNOWN_ERROR`. The cause was general: `failure()`
reads `code` only from a `JiraMcpError`, and every argument check in both
servers raised a bare `Error`. A call the client could have fixed by itself
("you passed both `content` and `storage`") came back looking like a crash.

**1.16.1** gives those paths real codes:

| Code | Class | Sites | Meaning |
|---|---|---|---|
| `INVALID_INPUT` | `InvalidInputError` (new) | 31 | arguments cannot be acted on as given |
| `TEMPLATE_MISSING_VAR` | `TemplateMissingVariableError` | 5 | a template rendered without a required variable |
| `ANCHOR_NOT_FOUND` | `AnchorNotFoundError` (new) | 1 | inline comment text is not on the page |
| `TEMPLATE_ERROR` | `TemplateError` | 1 | no page templates loaded on the server |

`TemplateMissingVariableError` and its row in the API reference had existed
since templates shipped. Nothing had ever raised it.

Patch bump: messages are unchanged and no tool, argument or field moved. A
client that matched on `UNKNOWN_ERROR` to detect a rejected call has to match
the new codes, which the changelog states as an upgrade note. Both packages
change in this release.

Commits `19d920f` (anchor), `e6f1d8f` (the rest), release commit `32a122a`, tag
`v1.16.1` (annotated).

## What the guard test caught

`packages/core/tests/typed-errors.test.ts` walks `src/` of all three packages
and fails on a bare `new Error(` outside `src/cli/`. It was written after the
sites had been listed by grep and converted, as a check that none would come
back. Its first run failed with six sites in
`packages/jira-mcp/src/operations/tempo-operations.ts`: the Tempo date range
and `group_by` checks.

Grep had reported that file clean, twice. It held a raw NUL byte inside a
string literal (the separator that joins report dimensions into a bucket key),
so grep treated the file as binary and printed nothing, and git had shown every
diff of it as `Bin 12601 -> 12697 bytes` since the day it was added. Nobody had
reviewed a text diff of that file.

The byte is now written as its six-character escape behind a named constant,
`KEY_SEPARATOR`, which is the same string at runtime. The guard test also
rejects raw control bytes in source.

How the byte got there is reproducible. An editing tool that takes its input as
JSON decodes that escape sequence into the byte itself. It happened three more
times while fixing this: in the new constant, in the guard test's own regex,
and in `CHANGELOG.md`. Each was caught by running `file` on the result. After
an edit that mentions a control character, check that the file is still text.

## Phases 1 to 4.7: gates

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 86 files, 1109 tests (was 85 / 1102) |
| `npm run test:coverage` | 86.1% lines, 73.6% branches, 88.3% functions |
| `npm run build` | both packages, `dist/index.js` 562 KiB |
| `validate_counts.py --full` | 21 tools, 24 CLI commands, 8 templates, 32 error classes, 86 test files, 1109 tests, badge 1.16.1 |
| Supply-chain greps | `--provenance` and `id-token: write` present |
| Licensing | 9 assertions green, banner in both bundles |
| `npm audit --omit=dev` | 0 vulnerabilities |

`validate_counts.py` without `--full` does not check the test count, which is
how the README went out in 1.16.0 saying 1093 tests when there were 1102. This
run used `--full`.

Before the release commit the locally built servers were driven over stdio
against KAN and DevOps with eight calls built to be rejected. Each answered the
expected code and none wrote anything.

## Phase 7: publish verification

| Check | Result |
|---|---|
| Publish workflow 35348907430 | green in 38s |
| GitHub release | v1.16.1, not a draft |
| `npm view` version, both packages | 1.16.1 |
| Provenance (`slsa.dev/provenance/v1`) | OK on both packages |
| `npm audit signatures` (throwaway project) | 3 verified registry signatures, 2 verified attestations |

Registry propagation: publish finished 13:13:30 UTC, both tarballs 404 until
13:21:07. Seven and a half minutes.

## Post-release run

Against the globally installed 1.16.1 binaries, over stdio JSON-RPC.

| Phase | Result |
|---|---|
| 1 Install | both binaries at 1.16.1, no `MISSING` or `INVALID` |
| 3 Server | `serverInfo` 1.16.1; the 21 tool names equal `definitions.ts` |
| 4 Live Jira (KAN) | KAN-15 created, read, updated, commented twice, moved to `W toku`, reassigned and unassigned, 15m logged, synced with the explicit JQL, read from cache, found by search, moved to `Gotowe` |
| 4 Error codes | `update_task` with no fields and `log_task_time` with `2d` answered `INVALID_INPUT`; a template without variables answered `TEMPLATE_MISSING_VAR`; `template_id` plus `markdown` answered `INVALID_INPUT` |
| 4 No side effects | after the four rejected calls KAN-15 still had exactly the 2 comments the run had added |
| 4b Live Confluence (DevOps) | space format, search, page read, comments, labels, attachments: all OK |
| 4b Refusals | markdown `update_page` answered `MARKUP_LOSS_REFUSED`, an empty `update_page` and an empty `add_page_labels` answered `INVALID_INPUT`, a missing anchor answered `ANCHOR_NOT_FOUND` |
| 4b No side effects | "DevOps Home" stayed at version 29 with 0 comments and 0 labels |
| 5 Supply chain | see above |
| 6 Cleanup | KAN-15 left in `Gotowe` with the `smoke-test` label; both binaries kept installed |

Step 4b.7's write half was skipped again, for the reason given in the
[1.16.0 record](release-verification-20260918.md#not-run).

## Outstanding

- `rules/jira-mcp.md` and `rules/confluence-mcp.md` gained a "read the `code`
  on a failure" rule. The copies agents actually load are published by
  `ai-toolkit add-rule`, so they stay at the old text until the rules are
  registered again.
