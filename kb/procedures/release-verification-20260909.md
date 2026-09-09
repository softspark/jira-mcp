---
title: "Release verification on 2026-09-09"
category: procedures
service: jira-mcp
tags: [release, verification, provenance, workspace, confluence, smoke-test]
version: "1.13.0"
created: "2026-09-09"
last_updated: "2026-09-09"
description: "Executed verification for the 1.12.0 workspace split and the 1.13.0 release, including the first live Jira smoke test since 1.6.0 and what it exposed."
---

# Release verification on 2026-09-09

Two releases went out on this date. Both published `@softspark/jira-mcp` and
`@softspark/confluence-mcp` from one tag, per
[ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md).

## Published 1.12.0

The workspace split. First public release of `@softspark/confluence-mcp`.

| Check | Result |
|---|---|
| Release SOP phases 1-7 | passed |
| npm versions | both `1.12.0` |
| Tarball reachability | HTTP 200 for both |
| Provenance | SLSA v1 on both |
| GitHub Release | created, not draft |

**First publish attempt failed** at `npm whoami` with `401 Unauthorized`: the
`NPM_TOKEN` repository secret had expired since the 1.11.0 release three days
earlier. Nothing was published; both publish steps were skipped. The token was
replaced and the same workflow run was re-run from the tag, so no version was
burned. The `Verify npm token` step existing at all is what made this a clean
failure instead of a half-published release.

## Published 1.13.0

Page templates, and a fix for space-key validation that rejected most real
Confluence space keys.

| Check | Result |
|---|---|
| Release SOP phases 1-7 | passed |
| Quality gates | typecheck, lint, 953 tests across 78 files, build, counts |
| Licensing gate | 9/9, banner present in all four bundles |
| npm versions | both `1.13.0` |
| Provenance | SLSA v1 on both |
| `npm audit signatures` | exit 0, 3 verified signatures, 2 verified attestations |
| GitHub Release | created 2026-09-09T13:56:22Z |

## Post-release testing

Run in full for the first time since 1.6.0. All seven phases passed.

| Phase | Result |
|---|---|
| 1 Install | both binaries installed globally at 1.13.0 |
| 2 CLI | `--help` clean, KAN listed with language `pl` |
| 3 MCP server | 19 Jira tools, 31 Confluence tools over stdio |
| 4 Live Jira API | KAN-8, all 15 steps |
| 4b Live Confluence API | DevOps space, 9 of 10 steps; see below |
| 5 Supply-chain | provenance and signatures verified |
| 6 Cleanup | KAN-8 moved to Gotowe, both binaries kept installed |

`KAN-8` follows the convention set by KAN-1, KAN-2 and KAN-7: left in Done with
the `smoke-test` label as an audit trail rather than deleted.

### Phase 4b detail

Run against the published binary and the live DevOps space
(`spyrosoftecommerce.atlassian.net`), page 769523713:

| Step | Result |
|---|---|
| 4b.1 space language and format | `en` / `storage` |
| 4b.2 list page templates | filtered to `decision-record`, the only storage template |
| 4b.3 search | 3 hits, absolute `/wiki/` URLs |
| 4b.4 get page | v18, `body_format: storage`, `has_storage_markup: true` |
| 4b.5 get page as storage | returned XHTML |
| 4b.6 markdown update | refused with `MARKUP_LOSS_REFUSED` |
| 4b.7 read comments | 0 comments, no error |
| 4b.8 inline anchor check | refused, text not on page |
| 4b.9 labels and attachments | both returned, 0 each |
| 4b.10 cleanup | nothing to clean |

**Step 4b.7's write was deliberately skipped.** The SOP allows one comment as
the phase's only write, but DevOps is a live documentation space, not a
sandbox like KAN. Reading comments exercised the same code path without
leaving an artifact on a page the team uses. A future run against a
throwaway space should execute the write.

The page was re-read after the phase: still v18. Nothing was modified.

## What the run exposed

Three things that had drifted, none of which any automated gate would have
caught:

**The globally installed CLI was still 1.11.0.** Every smoke test since the
split had run from a temporary directory. That validates the tarball, but not
the global install the CLI actually uses day to day, and the SOP's Phase 1 is
specifically about the latter. Two releases had shipped without it being
updated.

**Workflow status names are localised.** The SOP's Step 4.9 shows
`update_task_status({ status: "In Progress" })`. KAN's workflow is Polish:
`Do zrobienia`, `W toku`, `In Review`, `Gotowe`. Following the SOP literally
fails. The name must come from `get_task_statuses`, which is what the tool
description already says.

**The SOP covered one package.** It was written when the repository shipped
only `@softspark/jira-mcp`. Since 1.12.0 a release also ships a Confluence
server whose failure mode is destroying existing pages, and nothing in the
procedure exercised it. Phase 4b was added, deliberately non-destructive: its
central assertion is that `update_page` with markdown is **refused** on a page
carrying macros, and that the page's version number does not move.

All three are fixed in `sop-post-release-testing.md`.

## What inspecting KAN-8 exposed

The task itself is correct. Markdown reached Jira as real ADF structure: the
plain comment became an `h2` heading, a paragraph with a bold mark and a
two-item `bulletList`, and the templated comment rendered its `h2`/`h3`
hierarchy. Fields, labels, status and the 900-second worklog all match what the
steps set.

The procedure around it was not:

**The SOP prescribed an em dash.** Step 4.3's example summary read
`[SMOKE TEST] Test task vX.Y.Z — do usunięcia`, and `rules/jira-mcp.md`
forbids em dashes in generated summaries, comments and descriptions. Following
one document broke the other. Changed to parentheses.

**The SOP's comment steps omitted `user_approved`.** Steps 4.6 and 4.7 showed
calls without it, and the comment guard rejects both. Anyone following the
procedure literally hits `COMMENT_APPROVAL_REQUIRED` and has no way to know
from the SOP that the flag exists.

**Comment templates are English-only on a Polish project.** Step 4.7 posted a
comment headed "Status Update / Completed / Next Steps / Blockers" to KAN,
whose configured language is `pl`. Templates carry no language field and their
headings are fixed text, so `add_templated_comment` cannot honour the
language-first rule on any non-English project. Acceptable inside a smoke test,
which is testing rendering rather than producing content anyone reads. Not
acceptable in normal use, and now stated in `rules/jira-mcp.md`.

**CLAUDE.md described `rules/jira-mcp.md` as auto-generated.** It is not.
`AGENTS.md` is generated between `TOOLKIT:` markers; the rule files are
hand-maintained and are what `ai-toolkit add-rule` publishes, and
`validate_counts.py` treats the Jira one as a source of truth for tool names.
Following the old note would have meant never updating a file that must track
the tool surface.

## Still open

Localised comment templates. The workaround is a user override with the same
`id` in `~/.softspark/jira-mcp/templates/comments/`, which already works and
needs no release. A shipped fix would mean a `language` field on templates and
per-language variants of the eight built-ins; not started, no decision taken.

## Deviation on record

`@softspark/confluence-mcp` starts at 1.12.0 rather than the 1.0.0 the
SoftSpark module template mandates for a new module. This is deliberate; see
[ADR-0002](../decisions/ADR-0002-shared-version-across-packages.md).

## References

- [SOP: Release Creation](sop-release.md)
- [SOP: Post-Release Testing](sop-post-release-testing.md)
- [Previous verification, 2026-09-06](release-verification-20260906.md)
