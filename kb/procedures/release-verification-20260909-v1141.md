---
title: "Release verification: 1.14.0 and 1.14.1"
category: procedures
service: jira-mcp
tags: [release, verification, post-release-testing, templates, locales]
version: "1.14.1"
created: "2026-09-09"
last_updated: "2026-09-09"
description: "Executed record of the 1.14.0 release, the 1.14.1 patch it needed, and the full post-release test run against KAN and DevOps."
---

# Release verification: 1.14.0 and 1.14.1

Executed on 2026-09-09, following [sop-release](sop-release.md) and
[sop-post-release-testing](sop-post-release-testing.md).

## What shipped

**1.14.0** ships Polish versions of all eight built-in comment templates plus
`jira-mcp template list-locales` and `jira-mcp template install-locale <lang>
[--keep-english]`. Minor bump: new CLI commands. Both packages bumped together
per [ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md);
`@softspark/confluence-mcp` has no behaviour change in either release.

**1.14.1** fixes what the post-release run caught: `jira-mcp --help` did not
list either new command.

## The 1.14.1 finding

Phase 2 Step 2.1 prints the help output. The two commands added in 1.14.0 were
absent. The listing under "All commands" is a hand-written `addHelpText`
epilogue in `packages/jira-mcp/src/cli/index.ts`, so `program.command(...)`
registers a command without it appearing there, and nothing failed.

The gate did not catch it because `scripts/validate_counts.py` counts registered
commands against the README table; it never reads the epilogue.
`packages/jira-mcp/tests/cli/cli.test.ts` now walks the registered command tree,
renders the help through Commander, and fails when a command is missing from the
text. Verified by deleting the `template list-locales` line: the test failed with
`expected [ 'template list-locales' ] to deeply equal []`.

`hook comment-approval` is excluded by name. It is invoked by the ai-toolkit
hook, not by a person, and is deliberately left out of the listing.

The same epilogue exists in `packages/confluence-mcp/src/cli/program.ts`. It was
in sync, and it now has the same guard in
`packages/confluence-mcp/tests/confluence/cli.test.ts`, verified the same way by
deleting the `space set-format` line. That one needs no exclusion list: every
command it registers is meant to be listed.

## Phase 7: publish verification

| Check | Result |
|---|---|
| `npm view @softspark/jira-mcp version` | 1.14.1 |
| `npm view @softspark/confluence-mcp version` | 1.14.1 |
| Publish workflow (1.14.0, 1.14.1) | both green, including "Verify npm token" |
| GitHub release | v1.14.0 and v1.14.1, neither a draft |
| `npm audit signatures` | 267 verified registry signatures, 61 verified attestations |
| Locales in the published tarball | all 8 `templates-system/locales/pl/comments/*.md` present |

The tarball check matters more than it looks: the templates only ship because
`templates-system/**/*.md` in the `files` array happens to be a recursive glob.
A narrower pattern would have published a package whose `install-locale` finds
nothing, and no test would have failed.

## Phases 1 to 3: install and servers

Global install of both packages at 1.14.1, both binaries report `1.14.1`, both
resolve under the nvm node 22 bin directory. `jira-mcp --help` now lists
`template list-locales` and `template install-locale`. `template list-locales`
reports `pl  8`.

`tools/list` over stdio: 19 Jira tools, 31 Confluence tools.

**The Confluence count in the docs was wrong.** `CLAUDE.md` said 30 while its own
list named 31, and the count has been stale since `list_page_templates` was added
in 1.13.0. Corrected in `CLAUDE.md` and `packages/confluence-mcp/README.md`. Both
files, plus `rules/confluence-mcp.md`, were then checked to name all 31 live tool
names. `validate_counts.py` checks the Jira tool count only; the Confluence side
has no equivalent guard.

## Phase 4: live Jira, KAN-9

`get_project_language(KAN)` returns `pl` from the project entry.
`list_comment_templates` returns 16: the eight Polish overrides and the eight
English originals under `-en`, all sourced from
`~/.softspark/jira-mcp/templates/comments/`.

`template install-locale pl --keep-english` was run against the real config,
which already held the same 16 files installed by hand in an earlier session.
Three were diffed against the shipped originals before the run and were
byte-identical, and the file count was unchanged after it. The command is
repeatable on an installation that already has the templates.

KAN-9 was created, commented, transitioned, time-logged and deleted:

| Step | Result |
|---|---|
| `create_task` | KAN-9, 1h estimate, labels `test` and `post-release` |
| `add_templated_comment` (`status-update`) | comment 10210, rendered Polish: "Aktualizacja statusu", "Zrobione", "Następne kroki", "Blokery" |
| `get_task_statuses` | Polish workflow: `Do zrobienia`, `W toku`, `In Review`, `Gotowe` |
| `log_task_time` 45m | worklog 10200 |
| `update_task_status` to `W toku`, then `Gotowe` | both applied |
| `get_task_time_tracking` | 1h estimate, 45m spent, 15m remaining |
| `sync_tasks` / `search_tasks` / `get_task_details` | 5 synced, JQL found KAN-9, details returned `language: pl` |
| `delete_task` | deleted; the JQL search then returned 0 |

The templated comment is the whole point of the release: the same `template_id`
that produced English before now produces Polish, with the variable names
unchanged.

## Phase 4b: live Confluence, DevOps

`get_space_language(DevOps)` returns `en` and `body_format: storage`.
`list_page_templates` filters to the storage format and offers `decision-record`.
`search_pages(text="runbook")` returns real pages.

`get_page(769523713)` reads Cloudflare Proxy On/Off at version 18, body starting
with `<ac:structured-macro`. `update_page` with a markdown `content` on that page
was refused with `MARKUP_LOSS_REFUSED` and the page stayed at version 18. The
guard still protects a macro-bearing page.

## 1.14.2

Released the same day. No behaviour change: it ships the drift guard on the
Confluence `--help` listing that the 1.14.1 fix left missing on the other half
of the workspace, plus the corrected Confluence tool count.

Gates green (79 files, 972 tests), provenance verified on both packages,
GitHub release published, CI green on the release commit.

### The registry served 404 for the new tarball

Phase 7.2 failed for about seven minutes. `npm view` reported 1.14.2 with the
right `fileCount`, signature and provenance, `dist-tags.latest` already pointed
at it, and the tarball URL from that same metadata returned
`{"error":"Not found"}`. Both packages. `npm install -g` failed with
`404 tarball, folder, http url, or git url` for the whole window, so for those
minutes `latest` named a version nobody could install.

Polling both tarball URLs was the whole fix. jira-mcp came back first,
confluence-mcp about a minute later, and everything downstream passed unchanged.
1.14.1's tarball answered 200 throughout, which is what ruled out anything local.

Nothing to do about it beyond knowing it happens: it is npm CDN propagation, not
the package. A 404 here is only worth acting on if it outlives several minutes
of polling, and the thing to check first is whether an older version still
serves.

### Post-release run

Both binaries at 1.14.2, 8 locale files in the installed package, 19 Jira tools
and 31 Confluence tools over stdio. `jira-mcp --help` names both locale commands,
`confluence-mcp --help` names `space set-format`.

KAN-10 created, commented with the `deployment-note` template (Polish:
"Notatka z wdrożenia", "Zmiany", "Plan wycofania", "Co obserwować"),
transitioned, time-logged 20m against a 30m estimate, then deleted; the JQL
search returned 0 afterwards. Confluence: DevOps still reports `storage`,
page 769523713 still reads at version 18, and a markdown write was still
refused with `MARKUP_LOSS_REFUSED`.

## 1.14.3

A documentation-only release, cut on request. Everything in it lives in `kb/`,
which no tarball carries, so the published packages gain nothing at runtime.

Worth recording because Phase 1 is where this should have stopped and did not:
the SOP's bump table reads "Bugfix, typo, doc-only, patch", and "doc-only" there
means documentation that ships, which `kb/` does not. Diffing the published
1.14.2 and 1.14.3 tarballs, the only differences are the version itself: the
`version` field in package.json, the string tsup bakes into `dist/cli.js` and
`dist/index.js` from `src/version.ts`, and the badge and heading in README that
Phase 3 requires. `templates-system/` and `hooks/` are byte-identical.

The first CHANGELOG wording for it claimed the contents were identical to 1.14.2
and that no README changed. Both were wrong, because Phase 3 edits README before
Phase 5 commits it. Corrected after checking the actual tarball diff. Note that
`CHANGELOG.md` is not in either tarball at all: `files` lists it, but it sits at
the repository root while the pattern resolves inside the package directory.

Gates green, provenance verified on both packages, GitHub release published, and
the tarball answered 200 on the first attempt, so the seven-minute propagation
lag on 1.14.2 was a one-off.

Post-release run: both binaries at 1.14.3, 8 locale files installed, 19 and 31
tools over stdio, both help listings intact. KAN-11 created, commented with the
Polish `status-update` template, time-logged, transitioned and deleted. DevOps
still reports `storage`, page 769523713 still at version 18, markdown write still
refused.

## Outcome

All four releases published, verified and tested. Nothing outstanding.
