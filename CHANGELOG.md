# Changelog

All notable changes to `@softspark/jira-mcp` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## v1.14.4 -- The changelog actually ships (2026-09-09)

### Fixed

- **Both packages now contain the `CHANGELOG.md` their `files` list has promised
  since 1.12.0.** npm resolves `files` patterns inside the package directory,
  the changelog lives at the repository root, and a pattern matching nothing is
  dropped without a warning. Every release since the workspace split shipped
  without it, and the README version badge linked to a file the tarball did not
  contain. A symlink does not help, because `npm pack` skips it; each package's
  tsup config copies the root file in instead, so the root stays the one place
  anybody edits.
- **Changelog links in both READMEs pointed outside the package.**
  `../../CHANGELOG.md` resolves within the repository but not within a published
  tarball, so on npmjs.com those links were dead for the same reason.

### Added

- **A packaging test over both published packages.** It asserts that every
  `files` entry matches at least one real file, and that each package's copied
  changelog is identical to the root one. The first catches a manifest promising
  what it does not deliver; the second catches a release built before the
  changelog was edited, which would ship stale history.

## v1.14.3 -- Knowledge base only (2026-09-09)

**Behaviourally identical to 1.14.2.** Everything below lives in `kb/`, which no
tarball carries, so upgrading from 1.14.2 gains nothing at runtime. The version
exists to give the documentation below a release to sit against.

Diffing the two published tarballs, what actually differs is the version and
nothing else: the `version` field in package.json, the version string tsup bakes
into `dist/cli.js` and `dist/index.js`, and the badge and "What's New" heading in
README. `templates-system/` and `hooks/` are byte-identical.

### Added

- **A troubleshooting entry for an npm 404 on a version that was just
  published.** 1.14.2 was discoverable and uninstallable for about seven minutes:
  `npm view` reported the version with a correct `fileCount`, `shasum`,
  `integrity`, registry signature and SLSA provenance, `dist-tags.latest` already
  pointed at it, and the tarball URL from that same metadata returned
  `{"error":"Not found"}`. Both packages. It is CDN propagation, and the entry
  says to poll rather than deprecate and re-release, which is the instinctive and
  wrong response. It also records that a `curl` of the tarball returns a JSON
  error body, which `tar` reports as `Unrecognized archive format`, looking like
  a corrupt package when nothing is corrupt.
- **The executed record of the 1.14.0, 1.14.1 and 1.14.2 releases**, including
  the post-release runs against KAN and the DevOps space.

### Fixed

- **Closed a stale note.** The 1.12.0/1.13.0 verification record still listed
  localised comment templates as unstarted with no decision taken. They shipped
  in 1.14.0, and by a different design than that note guessed at.

## v1.14.2 -- Drift guard on the Confluence help listing (2026-09-09)

No behaviour change in either package. It ships the guard that the 1.14.1 fix
left missing on the other half of the workspace.

### Added

- **A test that fails when `confluence-mcp --help` stops naming a registered
  command.** The listing under "All commands" is a hand-written epilogue in
  `packages/confluence-mcp/src/cli/program.ts`, the same construction that let
  1.14.0 ship with two Jira commands missing from the help. The test walks the
  registered command tree, renders the help through Commander and fails on
  anything absent. Unlike the Jira one it needs no exclusion list: every command
  the Confluence CLI registers is meant to be listed.

### Fixed

- **Corrected the Confluence tool count in the docs.** `CLAUDE.md` and the
  package README said 30 while the server registers 31; the count went stale when
  `list_page_templates` landed in 1.13.0.

## v1.14.1 -- Help text lists the new commands (2026-09-09)

### Fixed

- **`jira-mcp --help` did not list `template list-locales` or
  `template install-locale`.** The command listing under "All commands" is
  hand-written, so the two commands added in 1.14.0 were invisible to anyone
  reading the help. A test now walks the registered command tree and fails when
  the listing misses one, which is what should have caught this.

## v1.14.0 -- Translated comment templates (2026-09-09)

Both packages are released together under one version.
`@softspark/confluence-mcp` has no behaviour change in this release.

### Added

- **Translated comment templates** -- the package now ships Polish versions of all
  eight built-in comment templates under `templates-system/locales/pl/comments/`,
  installed with `jira-mcp template install-locale pl`. A template cannot pick a
  language at render time, because its headings are fixed text in the body, so on
  a project configured for another language `add_templated_comment` posted English
  and broke the language-first rule.
- **`jira-mcp template list-locales`** -- lists the languages with shipped
  translations.
- **`jira-mcp template install-locale <lang> [--keep-english]`** -- installs them as
  overrides. Each translation keeps the English `id` and variable names of the
  template it replaces, so nothing that calls `add_templated_comment` breaks.
  `--keep-english` also installs the originals as `<id>-en`, for an install whose
  projects are not all in one language.

### Fixed

- **Documented that the template catalog is read once, at server startup.**
  `template add` and `install-locale` change what the CLI reports immediately, but
  a running MCP server keeps serving the catalog it loaded, and the next templated
  comment silently renders the old version. Both commands now say to restart the
  client, and it is stated in the rules and the templates reference.

## v1.13.0 -- Page templates and real space keys (2026-09-09)

Both packages are released together under one version. `@softspark/jira-mcp` has
no behaviour change in this release; it ships because the shared template engine
moved into the package both servers bundle.

### Added

- **Confluence page templates** -- `list_page_templates` lists what is usable in a
  space, filtered to its body format, and `create_page` accepts `template_id` plus
  `variables`. Three ship with the package: `runbook` and `incident-review` in
  markdown, `decision-record` in storage using Confluence status and info macros.
  User templates in `~/.softspark/jira-mcp/templates/pages/*.md` override a shipped
  one by id; a malformed file is skipped rather than breaking startup.
- **`rules/confluence-mcp.md`** -- agent rules for the Confluence server, registrable
  with `ai-toolkit add-rule`, matching how `rules/jira-mcp.md` works.

### Changed

- **`renderTemplate` moved to the shared core package** -- the `{{variable}}` engine is
  plain text substitution and is now used by Jira comment and task templates and by
  Confluence page templates alike.

### Fixed

- **Confluence space keys are no longer forced to uppercase** -- the validator applied
  Jira's project-key rule, which rejected real spaces: Confluence keeps the case a
  space was created with (`DevOps`, `Puccini`, `MTPapp`) and personal space keys start
  with `~`. Every one of those was rejected by `space add`.

## v1.12.0 -- Confluence support, split into two packages (2026-09-09)

This release turns the repository into an npm workspace. `@softspark/jira-mcp`
keeps its name, contents and CLI; Confluence ships as its own package. Both are
released together under one version.

### Added

- **`@softspark/confluence-mcp`** -- a second published package and stdio MCP server
  covering Confluence Cloud. It reads the same `config.json` and `credentials.json`
  as the Jira server, because one Atlassian site serves both products from the same
  host with the same API token. The tool lists stay separate: merging them would put
  `search_tasks` beside `search_pages` and `get_task_details` beside `get_page`, and
  near-homonyms in one list make tool selection worse. A workspace test asserts the
  two lists never share a name.
- **`@softspark/atlassian-mcp-core`** -- private, unpublished workspace package holding
  the configuration loader, ADF conversion, HTTP transport, error hierarchy and MCP
  response envelope. Both servers bundle it at build time, so it never reaches a
  consumer as a separate dependency.
- **Per-space body format** -- `format: "markdown" | "storage"` on a space in config.json,
  with `default_format` as the global fallback and
  `confluence-mcp space set-format <KEY> <format>` to set it. A `storage` space reads and
  writes Confluence XHTML and refuses markdown writes; a `markdown` space accepts both,
  because storage never loses anything. `get_space_language` reports the format alongside
  the language, and `list_spaces` reports it per configured space.
- **Storage-format support for Confluence pages** -- `get_page` accepts
  `body_format: "storage"` and reports `has_storage_markup`; `create_page` and
  `update_page` accept a `storage` body. Confluence stores macros, page links and
  attachment references as XHTML that markdown cannot express, and a markdown round-trip
  would keep the prose and silently delete the rest.
- **`spaces` section in config.json** -- maps a Confluence space key to a site URL and
  an optional content language, mirroring how `projects` maps Jira. Both keys are
  optional, so a config written before this release still validates.
- **`confluence-mcp space` commands** -- `add`, `remove`, `list`, `set-default`,
  `set-language`, `set-format`. Credentials stay on `jira-mcp config set-credentials`.
- **Pages** -- `search_pages` (plain text or raw CQL), `get_page`, `list_space_pages`,
  `get_page_children`, `create_page`, `update_page`, `move_page`, `delete_page`.
- **Comments** -- `get_page_comments`, `add_page_comment`, `delete_page_comment`,
  plus `get_page_inline_comments` and `add_page_inline_comment` for anchored review
  threads. An inline comment verifies its anchor text exists in the page before
  writing, because a wrong occurrence count silently anchors to the wrong passage.
- **Blog posts** -- `list_blog_posts`, `get_blog_post`, `create_blog_post`,
  `update_blog_post`, `delete_blog_post`.
- **Restrictions** -- `get_page_restrictions` and `set_page_restrictions`. Reads report
  `inherits_space_permissions` so an empty result is not misread as "nobody has
  access". Writes replace rather than merge and require `user_approved`, because
  clearing restrictions exposes a page that was deliberately private.
- **Whiteboards** -- `get_whiteboard`, `create_whiteboard`, `delete_whiteboard`.
  Metadata only: whiteboard drawing content has no REST representation, and the tool
  descriptions and results say so.
- **Labels and attachments** -- `get_page_labels`, `add_page_labels`,
  `remove_page_label`, `list_attachments`, `upload_attachment` (25 MB cap).
- **Confluence error classes** -- `ConfluenceConnectionError`,
  `ConfluenceAuthenticationError`, `ConfluencePermissionError`, `PageNotFoundError`,
  `VersionConflictError` and `MarkupLossError`, each with its own code.

### Changed

- **Repository is an npm workspace** -- sources moved to `packages/core`,
  `packages/jira-mcp` and `packages/confluence-mcp`. Typecheck, lint, tests and
  coverage run once across all three; each published package builds its own bundle.
  Nothing changes for consumers of `@softspark/jira-mcp`: same name, same binary,
  same config path.
- **Shared HTTP transport** -- auth, retry, exponential backoff, `Retry-After` and
  empty-body handling now live in one client used by both products. Connectors inject
  only a status-to-error mapper, removing a duplicated fetch loop.
- **`update_page` no longer rewrites a body it was not asked to change** -- a
  title-only rename or a re-parent writes the existing body back verbatim instead of
  round-tripping it through markdown.
- **`update_page` refuses a markdown body that would destroy markup** -- when the page
  contains Confluence macros, page links or attachment references, the call fails with
  `MARKUP_LOSS_REFUSED` and says to send `storage` instead. `allow_markup_loss: true`
  overrides it after the user agrees.

### Fixed

- **`config add-project` and `config remove-project` no longer drop config fields** --
  both rebuilt config.json from the fields they knew about, which already discarded
  `default_language` and would have deleted the entire Confluence `spaces` section.
  Both now spread the loaded object.
- **Confluence links resolve against the `/wiki` context path** -- page, search-result
  and attachment URLs are returned relative to `/wiki`, and resolving them against the
  site origin dropped that segment and produced links that 404.

## v1.11.0 -- Local audits and private configuration (2026-09-06)

- Add text, JSON and SARIF audits for local filesystem permissions and shipped hook ownership.
- Create new configuration/cache directories with mode 0700 and state files with mode 0600.
- Complete third-party attribution in NOTICE and require the full applicable module and SOP artifact set in CI.
- Require behavior, tests and documentation in the same pull request; correct the lockfile-based signature verification procedure.

## v1.10.0 -- Remaining Estimate (2026-09-01)

### Added

- **`remaining_estimate` in `update_task`** -- writes `timetracking.remainingEstimate`.
  Jira keeps the two estimates independent: setting `original_estimate` on a parent
  issue leaves its remaining estimate at the old value, so a report that sums
  remaining still showed the pre-edit total. Setting one field does not disturb
  the other, and both can be sent in a single call. Same format and day rejection
  as `original_estimate`.

## v1.9.0 -- Sub-tasks and Estimates (2026-09-01)

### Added

- **`parent_key` in `create_task`** -- sets the Jira `parent` field so sub-tasks can be
  created at all. `epic_key` resolves the Epic Link custom field, which is a different
  field, so passing it for a sub-task made Jira answer with
  `Issue type is a sub-task but parent issue key or id not specified`.
- **`original_estimate` in `create_task` and `update_task`** -- writes
  `timetracking.originalEstimate`. Estimates could only be set by hand in the Jira UI
  before; `log_task_time` logs work already done, which is a different field.
  Accepts the same `"2h"` / `"30m"` / `"2h 30m"` format as `log_task_time` and rejects
  days through the same parser.

## v1.8.1 -- Duplicate Detection (2026-08-03)

### Fixed

- **Duplicate detection never matched anything.** `findExistingTask` searched with
  `summary = "..."`, but `summary` is a text field and JQL only supports `~` on it.
  Jira answers `=` with an empty result set instead of an error, so every lookup
  reported "not found": `update_existing` never updated, and re-running a bulk config
  created a second copy of every task. The lookup now uses a quoted `~` phrase and
  compares the returned summary exactly, since `~` is a fuzzy match. Found by running
  a config twice against a live instance and getting a duplicate issue.

## v1.8.0 -- Status Paths (2026-08-03)

### Added

- **`status` accepts an ordered path** in bulk task configs -- `"status": ["On hold", "Open"]`
  walks the transitions one at a time. Jira only exposes the transitions available from an
  issue's *current* status, so a target that is not directly reachable from the initial
  status could not be set at all before. A plain string still means a single transition.
- **`warnings` in `create_monthly_tasks` output** -- per-task problems that did not stop the
  issue from being written now surface in the tool response instead of being dropped by the
  counters-only summary.

### Fixed

- **A rejected status transition is no longer silent.** `setStatus` swallowed every failure,
  including the ordinary case of the requested status simply not being reachable: the issue
  was created, the status was ignored, and the run reported `failed: 0`. Eleven monthly admin
  tasks sat in the wrong status for months because of this. The transition is now reported as
  a `warning` on the task result, naming the status that failed and listing the ones that were
  reachable at that point. The issue itself is still created -- the transition stays non-fatal.

### Changed

- **`TaskResult` gains a `warning` field** (`string | null`). `formatBulkResult` prints it
  indented under the task line. Consumers destructuring `TaskResult` are unaffected; anyone
  constructing one now has to supply the field.



### Changed -- licence: MIT to Apache-2.0

The project is now licensed under the Apache License 2.0. It stays permissive:
fork it, modify it, ship it commercially. What changes is what a redistributor
owes back.

- **`NOTICE` is the point.** MIT already required keeping the copyright notice, so
  attribution is not new. Apache-2.0 adds section 4(d): a redistributor must carry
  the contents of `NOTICE` -- project name, copyright, source URL -- into their
  distribution. `NOTICE` is in `package.json` `files`, so it ships with the package.
- **Modified files must say so** (section 4b), an express patent grant with
  retaliation (section 3), and no rights to the project or company names
  (section 6). None of these existed under MIT.
- **Attribution reaches the published bundles through a build banner.** This is
  the part specific to this package: npm ships `dist/`, not `src/`, and the build
  runs with `minify: true`, which strips every comment. SPDX headers in `src/`
  are for whoever clones the repository; consumers see the tsup `banner`, now
  present in both `dist/index.js` and `dist/cli.js`.
- **SPDX headers on 165 source files**, placed after any shebang.
- **Nothing is revoked.** Releases up to and including v1.6.0 were published under
  MIT and remain available under MIT. All contributions were made by the
  copyright holder, so no third-party permission was required.

`LICENSE` holds the verbatim Apache-2.0 text, cross-verified against two
independent published copies before being written.

### Tests

- `tests/licensing.test.ts`, 8 assertions run by `npm test`: SPDX headers present
  and naming Apache-2.0, `LICENSE` complete, `NOTICE` carrying attribution and
  section 4(d), both files in `package.json` `files`, `package.json` declaring
  Apache-2.0, and **both build entries carrying the licence banner**. The banner
  assertion exists because losing it would strip attribution from the published
  artifact while every other check stayed green.

---

## v1.6.0 -- ADF Nested Lists, Task Lists & Doc-Parity Gates (2026-06-10)

### Added
- **Nested list support in ADF conversion** -- indented markdown lists (2 spaces or tab) now produce properly nested `bulletList`/`orderedList` ADF nodes instead of being flattened, in both write and read directions. Read direction renders nesting with 2-space indentation.
- **Task list (checkbox) support** -- `- [ ]` / `- [x]` markdown converts to ADF `taskList`/`taskItem` nodes (Jira checkboxes) with document-unique `localId`s, and renders back to markdown checkboxes including nesting. Nested bullet/ordered lists under a task item are lifted to siblings after the task list to keep the ADF valid.
- **Image degradation** -- `![alt](url)` markdown converts to a link (alt text as label, URL as fallback) instead of leaking a stray `!` into the text. ADF media nodes require uploaded attachments, so a link is the lossless-enough fallback.
- **`date` node rendering on read** -- ADF date nodes now render as `YYYY-MM-DD` instead of disappearing from task descriptions and comments.
- **Doc-parity checks in `validate_counts.py`** -- the validator now also verifies the README version badge against `package.json`, and that every MCP tool from `definitions.ts` is documented in `kb/reference/api.md` and named in `rules/jira-mcp.md`.

### Changed
- **CI enforces the coverage gate** -- the test job runs `npm run test:coverage`, so the 70% thresholds (lines, branches, functions) actually block merges. Branch coverage raised from 64.5% to above the threshold with new CLI and ADF edge-case tests.

### Fixed
- **README version badge drift** (1.4.3 -> 1.5.0) and stale test counts.
- **`kb/reference/api.md`** now documents `search_tasks`, `delete_task`, and `delete_comment`, which were missing despite the "complete reference" claim.
- **`rules/jira-mcp.md` / `AGENTS.md`** tool list extended to all 19 tools (was 17) and the CLI table extended to all 20 commands (was 14).
- **Dev dependency vulnerabilities** -- `npm audit fix` applied (7 advisories: fast-uri, brace-expansion, hono, ip-address chains). Runtime dependencies were and remain clean.

---

## v1.5.0 -- Bulk Template Management & Monthly Tasks Tool (2026-05-04)

### Added
- **`template add bulk` CLI command** -- new third template kind alongside `comment` and `task`. Validates the source JSON against `BulkConfigSchema` and installs it under `~/.softspark/jira-mcp/templates/tasks/<KEY>/monthly_admin.json`. `template list/show/remove` also support the `bulk` kind, keyed by project. Prunes the empty project subdirectory on remove.
- **`create_monthly_tasks` MCP tool** -- exposes the existing `create-monthly` CLI handler over the protocol. Inputs: `{ execute?: boolean, project?: string }`. Returns a structured result with per-project status (success/error), summary counts, and the resolved config path. Lets MCP clients run monthly bulk task creation without dropping to the CLI.

## v1.4.3 -- JQL Escape & Cache Recovery (2026-04-18)

### Fixed
- **`sync_tasks` default JQL parse error** -- `escapeJql` was over-escaping JQL operators (`-`, `+`, `&`, `|`, etc.) inside double-quoted string literals. Jira rejected the resulting query with `'\-' jest niedozwoloną sekwencją modyfikacji JQL`. The escape now only handles `\` and `"` (the only sequences valid inside a quoted JQL string), so `sync_tasks` works without an explicit `jql` argument when the username contains a hyphen.
- **`reassign_task` / `update_task_status` cache miss after Jira mutation** -- both operations now recover from a cache miss by fetching the task from Jira via `connector.getIssue` and upserting it into the local cache. Previously, calling either tool right after `create_task` (cache not populated) or `log_task_time` (cache invalidated) failed with `TASK_NOT_FOUND` even though the Jira mutation succeeded.

### Added
- **`CacheManager.upsertTask(task)`** -- inserts a task or replaces it by key, tolerating a missing cache file. Used by the new mutation-recovery path.

## v1.4.2 -- Supply-Chain Hardening (2026-04-18)

### Added
- **npm provenance attestation** -- `publish.yml` now publishes with `--provenance` and `id-token: write`, producing a SLSA v1 attestation on every release. Consumers can verify via `npm audit signatures` or the Provenance badge on npmjs.com.
- **Supply-chain gates in release SOP** -- `kb/procedures/sop-release.md` adds a pre-tag check for `--provenance` and `id-token: write` in `publish.yml`, plus a post-publish step that asserts `predicateType == https://slsa.dev/provenance/v1`.
- **Provenance verification in post-release SOP** -- `kb/procedures/sop-post-release-testing.md` adds Phase 5 covering the SLSA attestation check, `npm audit signatures`, and the npmjs.com Provenance badge.
- **Version-sync step in pre-commit SOP** -- `kb/procedures/sop-pre-commit.md` adds Step 6 verifying `package.json` and `package-lock.json` agree on the `version` field.

### Changed
- **Release workflow permissions** -- `packages: write` and `id-token: write` added to `.github/workflows/publish.yml` for OIDC attestation.
- **Release commit now stages the lockfile** -- SOP Phase 5 stages `package.json`, `package-lock.json`, `CHANGELOG.md`, and `README.md`. Prevents lockfile drift between tags.

### Fixed
- **`package-lock.json` top-level version drift** -- lockfile root `version` was stuck at `1.0.0` across prior releases. Regenerated via `npm install --package-lock-only` and now matches `package.json` on every release commit.

## v1.4.1 -- Template Loading Fix (2026-04-15)

### Fixed
- **File-backed templates missing after install** -- `PACKAGE_ROOT_DIR` used a hardcoded `../..` relative depth that resolved correctly in the source layout but overshot by one level after tsup bundling. Replaced with `findPackageRoot()` that walks up looking for `package.json`. All 8 built-in comment templates now load correctly from global installs.

## v1.4.0 -- Delete Tools & Error Hardening (2026-04-15)

### Added
- **`delete_task` tool** -- delete a Jira issue with ownership enforcement (creator only) and explicit user approval guard.
- **`delete_comment` tool** -- delete a comment with ownership enforcement (author only) and explicit user approval guard.
- **Markdown table support in ADF** -- `markdownToAdf()` now converts markdown tables to ADF table nodes.

### Changed
- **Narrowed cache cleanup catch blocks** -- `deleteTask()` and `logTime()` now catch only `TaskNotFoundError` and `CacheNotFoundError` instead of swallowing all exceptions. Unexpected I/O or corruption errors propagate.

### Fixed
- **Silent cache errors** -- cache I/O failures during post-delete and post-worklog cleanup were silently ignored, leaving stale entries without any signal.

## v1.3.0 -- File-Backed Templates & Approval Hooks (2026-04-15)

### Added
- **File-backed template catalog** -- ship built-in comment and single-task templates as physical markdown files under `templates-system/`.
- **Template management CLI** -- add `jira-mcp template add/list/show/remove` for global user overrides in `~/.softspark/jira-mcp/templates/`.
- **Task templates for `create_task`** -- add `list_task_templates` and template-based issue creation with variable rendering.
- **Comment approval hook manifest** -- ship `hooks/jira-mcp-hooks.json` for ai-toolkit `inject-hook` flows that preview and gate Jira comment writes.

### Changed
- **Template loading model** -- resolve active templates from system files plus global user overrides, with user files winning on `id` collisions.
- **Configuration init** -- create dedicated template directories for comments, single-task templates, and bulk task configs.
- **README validation** -- exclude internal tool helpers from MCP tool counts and refresh counts to match the current source tree.

### Fixed
- **Comment write safety** -- require explicit `user_approved=true` before `add_task_comment` and `add_templated_comment` can mutate Jira.
- **Comment preview flow** -- render templated comment previews before execution so approval can target the exact outgoing markdown.

## v1.2.0 -- Per-Instance Credentials & Jira API Migration (2026-04-14)

### Added
- **Per-instance credentials** -- `set-credentials --url` flag allows different API tokens per Jira instance. Auto-migrates legacy Format A to Format B on first use.
- **Live Jira API smoke tests** -- post-release SOP now includes Phase 4 with 15 steps testing all MCP tools against the KAN sandbox project.
- **`validate_counts.py` in pre-commit SOP** -- added as Step 5 to catch README count drift before commit.

### Changed
- **Search endpoint migrated** -- `/rest/api/3/search` → `/rest/api/3/search/jql` (Jira Cloud deprecated the old endpoint with HTTP 410).
- **`set-credentials` CLI** -- read-modify-write instead of overwrite. Preserves existing credentials when adding instance overrides.

### Fixed
- **Jira Cloud 410 on sync/search** -- `sync_tasks` and `search_tasks` failed on instances where Jira had removed the legacy search endpoint.

---

## v1.1.0 -- Hardening & Market Readiness (2026-04-14)

### Added
- **Boundary test suite** -- 96 new tests covering `server.ts` (25), `cli/index.ts` (27), and `JiraConnector` (44). Total: 509 tests across 51 files.
- **Retry/backoff for transient failures** -- `JiraConnector` retries 429 and 503 responses up to 3 times with exponential backoff (1s/2s/4s). Respects `Retry-After` header.
- **Count validation script** -- `scripts/validate_counts.py` verifies README counts match source code. Enforced in CI via `validate-counts` job.
- **Count validation in CI** -- new `validate-counts` job in `ci.yml` catches README drift before merge.
- **ADR-0001** -- documented "hardening before refactor" decision with alternatives and guardrails.
- **Hardening plan** -- full plan with success criteria and pre-mortem in `kb/planning/`.

### Changed
- **server.ts refactored** -- 719 → 324 lines (-55%). Tool definitions extracted to `src/tools/definitions.ts`, argument helpers to `src/tools/args.ts`.
- **Major dependency upgrades** -- TypeScript 5 → 6, ESLint 9 → 10, zod 3 → 4, vitest 3 → 4, @types/node 22 → 25.
- **TypeScript 6 migration** -- added `types: ["node"]` and `ignoreDeprecations: "6.0"` to tsconfig.
- **zod 4 migration** -- `.default({})` replaced with factory function in `BulkOptionsSchema`.
- **vitest 4 migration** -- arrow function mocks replaced with regular function syntax for constructor compatibility.
- **Bundle size** -- 325KB → 520KB (due to zod 4, which is significantly larger).
- **README** -- "Zero runtime dependencies" corrected to "Minimal runtime dependencies". Test counts updated.
- **CONTRIBUTING.md** -- full CI workflow documented, `validate:counts` noted as maintainer-managed.
- **Coverage exclusions reduced** -- `server.ts` and `jira-connector.ts` removed from vitest exclusion list.

### Security
- **Cache file permissions** -- all cache writes use `mode: 0o600` (owner-only). Prevents local privilege escalation on shared machines.
- **CWD config loading warning** -- stderr warning when `config.json` or `credentials.json` loaded from working directory instead of global config.
- **Error message truncation** -- Jira API error responses truncated to 200 characters to prevent information leakage.
- **`saveJsonFile` JSDoc** -- `@security` annotation warns against use for sensitive data.

### Documentation
- **Hardcoded counts removed** from secondary docs (CLAUDE.md, kb/, rules/, copilot-instructions). Counts live only in README (single source of truth pattern from ai-toolkit).
- **KB docs updated** -- caching.md, architecture.md, configuration.md, troubleshooting/common-issues.md reflect security changes.
- **Release SOP updated** -- Step 4.5 (validate counts) and Step 3.2 (README "What's New" update) added.

---

## v1.0.0 -- Initial Public Release (2026-04-14)

### MCP Tools (15)

- **`sync_tasks`** -- sync Jira tasks to local cache with optional JQL filter
- **`read_cached_tasks`** -- read tasks from local cache without hitting Jira
- **`update_task_status`** -- change task status via workflow transition
- **`update_task`** -- update existing issue fields (summary, description, priority, labels) with ADF conversion
- **`add_task_comment`** -- add markdown comment (auto-converted to ADF)
- **`reassign_task`** -- reassign or unassign a task by email
- **`get_task_statuses`** -- get valid workflow transitions for a task
- **`get_task_details`** -- get full details with description, comments, and project language
- **`get_project_language`** -- get configured language for a project (for AI assistants)
- **`log_task_time`** -- log work time in `"2h 30m"` format
- **`get_task_time_tracking`** -- get time tracking info (estimate, spent, remaining)
- **`list_comment_templates`** -- list available comment templates by category
- **`add_templated_comment`** -- add comment using a template with variable interpolation
- **`create_task`** -- create a new Jira issue with ADF description, assignee, labels, epic link
- **`search_tasks`** -- search Jira issues with raw JQL (no caching)

### CLI Commands (16)

- **`jira-mcp`** / **`jira-mcp serve`** -- start MCP server (stdio transport)
- **`jira-mcp config init`** -- initialize global config at `~/.softspark/jira-mcp/`
- **`jira-mcp config add-project <key> <url>`** -- add a Jira project mapping
- **`jira-mcp config remove-project <key>`** -- remove a project
- **`jira-mcp config list-projects`** -- show configured projects with language column
- **`jira-mcp config set-credentials`** -- set API credentials
- **`jira-mcp config set-default <key>`** -- set default project
- **`jira-mcp config set-language <lang>`** -- set global default language
- **`jira-mcp config set-project-language <key> <lang>`** -- set language for a specific project
- **`jira-mcp create <path>`** -- create tasks from bulk config file (dry-run by default)
- **`jira-mcp create-monthly`** -- run monthly admin task templates
- **`jira-mcp cache sync-workflows`** -- sync workflow status transitions
- **`jira-mcp cache sync-users`** -- sync user list for reassignment
- **`jira-mcp cache list-workflows`** -- show cached workflows
- **`jira-mcp cache list-users`** -- show cached users

### Features

- **Multi-instance routing** -- single server manages multiple Jira Cloud/Server instances. Project key determines routing. Connectors deduplicated by URL via InstancePool.
- **Language configuration** -- global `default_language` with per-project override. Supports: pl, en, de, es, fr, pt, it, nl. AI assistants check language before writing content.
- **ADF round-trip** -- bidirectional Markdown ↔ Atlassian Document Format conversion. Zero-dependency built-in parsers (~330 lines each). Literal `\n` normalization for MCP tool parameters.
- **Local caching** -- tasks synced to `~/.softspark/jira-mcp/cache/` with atomic writes. Workflow and user caches for offline status validation and assignee resolution.
- **Comment templates** -- 8 built-in templates with `{{variable}}` interpolation and `{{#var}}...{{/var}}` conditional blocks.
- **Bulk task creation** -- JSON config templates with dry-run default, rate limiting, epic link discovery, bilingual support (8 languages), idempotent updates.
- **Per-instance credentials** -- Format A (single credential) and Format B (per-URL credentials with default fallback). Backward compatible.
- **Supply chain protection** -- `ignore-scripts=true`, no axios, no dynamic requires. Self-contained 325KB bundle, 1 runtime dep (commander).
- **Strict TypeScript** -- `strict: true`, no `any`, `readonly` interfaces, Zod validation at all boundaries. 413 tests across 47 test files.
- **Typed error hierarchy** -- 15 error classes with machine-readable codes. Structured `{ success, error, code }` responses.

### Architecture

Four layers -- each depends only on layers below:

1. **Types & Config** (`config/`, `errors/`, `*/types.ts`) -- pure data, zero runtime deps
2. **Infrastructure** (`connector/`, `cache/`, `adf/`, `templates/`) -- I/O and external APIs
3. **Business Logic** (`operations/`, `bulk/`) -- orchestrates infrastructure
4. **Entry Points** (`tools/`, `cli/`, `server.ts`) -- thin dispatchers

### AI Toolkit Integration

- **Rules file** (`rules/jira-mcp.md`) -- register with `ai-toolkit add-rule` for automatic language checks, sync-first workflow, and tool reference injection.
- **GitHub Copilot** (`.github/copilot-instructions.md`) -- full project context for Copilot-assisted development.
