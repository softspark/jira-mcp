---
title: "Confluence MCP Server - Reference"
category: reference
service: jira-mcp
tags: [confluence, mcp, adf, cql, pages, spaces, attachments]
version: "1.11.0"
created: "2026-09-09"
last_updated: "2026-09-09"
description: "Reference for the confluence-mcp server: architecture, space routing, the v1/v2 API split, ADF bodies, version conflicts, and the full tool surface."
---

# Confluence MCP Server - Reference

## Overview

`confluence-mcp` is the second stdio MCP server shipped by `@softspark/jira-mcp`. It exposes Confluence Cloud pages, comments, labels and attachments as MCP tools.

It shares configuration, credentials, the ADF conversion layer and the error base class with the Jira server, and shares nothing else. Both binaries build from the same source tree, so a change to a shared layer fails the build for both.

## Why two servers

A single server advertising both products would list `search_tasks` next to `search_pages`, `get_task_details` next to `get_page`, and `add_task_comment` next to `add_page_comment`. Near-homonyms in one tool list make model tool selection measurably worse, and the failure is silent: the wrong tool returns a plausible answer about the wrong system.

Splitting the surface costs one extra entry in the MCP client config and nothing else. Users who need only one product register only that one.

## Module layout

```
src/
├── confluence-cli.ts             # bin: confluence-mcp
├── confluence-server.ts          # MCP server + dispatch
│
├── cli/
│   ├── confluence.ts             # Commander program
│   └── commands/space/index.ts   # space add|remove|list|set-default|set-language
│
├── http/
│   └── atlassian-client.ts       # shared auth + retry, used by both products
│
└── confluence/
    ├── connector.ts              # ConfluenceConnector (v2 + v1)
    ├── instance-pool.ts          # ConfluenceInstancePool, keyed by space key
    ├── page-operations.ts        # PageOperations: markdown boundary, read-modify-write
    ├── types.ts                  # ConfluencePage, ConfluenceComment, ...
    └── tools/
        ├── definitions.ts        # MCP tool definitions
        ├── helpers.ts            # deps, ops factory, language lookup
        ├── spaces.ts
        ├── pages.ts
        ├── comments.ts           # footer and inline
        ├── blogposts.ts
        ├── restrictions.ts
        ├── whiteboards.ts
        ├── labels.ts
        └── attachments.ts
```

Layering matches the Jira side: types and config, then infrastructure (`connector`), then business logic (`page-operations`), then entry points (`tools`, `confluence-server.ts`, `cli`).

## Configuration

Spaces live in the `spaces` section of the shared `~/.softspark/jira-mcp/config.json`:

```json
{
  "projects": { "KAN": { "url": "https://site.atlassian.net" } },
  "default_project": "KAN",
  "default_language": "pl",
  "spaces": {
    "DOCS": { "url": "https://site.atlassian.net", "language": "pl" },
    "KB": { "url": "https://other.atlassian.net" }
  },
  "default_space": "DOCS"
}
```

`credentials.json` is untouched: the same email and API token authenticate both products on a given site, and per-instance credentials resolve by URL exactly as they do for Jira.

An absent or empty `spaces` section is a startup error, not an empty result. A Confluence server with no reachable space cannot answer a single call, and failing once at startup reads far better than every later call failing on its own.

`ConfigFileSchema` keeps `spaces` and `default_space` optional, so a config written before this feature still validates.

### Config writers must spread

Every command that writes config.json spreads the loaded object instead of rebuilding it. `jira-mcp config add-project` and `config remove-project` previously listed their fields explicitly, which silently dropped `default_language`; once `spaces` existed, the same code would have deleted the entire Confluence configuration. Both were fixed, and `tests/confluence/config.test.ts` holds the regression in both directions.

## Space routing

Jira routes by parsing an issue key: `PROJ-123` yields `PROJ`, which selects a connector. Confluence page ids are opaque numbers carrying no space information, so that trick does not transfer.

`ConfluenceInstancePool.resolveSpaceKey()` resolves in this order:

1. the explicit `space_key` argument
2. `default_space`
3. the only configured space, when exactly one exists

With several spaces configured and no default, an unnamed call throws instead of guessing. Writing a page into the wrong space is not something the caller can notice before it happens.

Connectors are deduplicated by site URL, so several spaces on one site share one connector and one auth header.

## API versions

| Concern | API | Path |
|---------|-----|------|
| Pages, blog posts, comments (footer and inline), labels (read), attachments (read), spaces, whiteboards | v2 | `/wiki/api/v2/...` |
| Full-text search (CQL) | v1 | `/wiki/rest/api/search` |
| Label writes | v1 | `/wiki/rest/api/content/{id}/label` |
| Attachment upload (multipart) | v1 | `/wiki/rest/api/content/{id}/child/attachment` |
| Page restrictions | v1 | `/wiki/rest/api/content/{id}/restriction[/byOperation]` |
| Cross-space and sibling moves | v1 | `/wiki/rest/api/content/{id}/move/{position}/{targetId}` |

The split is deliberate: Confluence Cloud v2 exposes none of the v1 rows above. Do not consolidate them onto v2, they do not exist there.

Multipart upload additionally needs `X-Atlassian-Token: no-check`, Confluence's XSRF opt-out. Without it the request is rejected.

## Shared transport

`src/http/atlassian-client.ts` holds the one HTTP client both products use. Jira and Confluence sit on the same host, authenticate with the same Basic credentials and rate-limit identically, so auth, exponential backoff on 429 and 503, `Retry-After` handling and empty-body handling are written once.

The only injected piece is the status-to-error mapper, because that is genuinely the only thing that differs. Each connector supplies its own and keeps its own error vocabulary.

The mapper returns an error rather than throwing, which keeps the retry loop in charge of *when* to raise: a mapped 429 is still retried, and only the final attempt's error escapes.

## Moving pages

Two endpoints, chosen by what the move actually is:

- **Same space, become a child** uses the v2 update. It carries the page's own title, body and version, and is the better-documented route.
- **Different space, or a sibling position** uses the v1 content-tree endpoint. v2 cannot change `spaceId` and cannot express sibling ordering at all.

`PageOperations.movePage()` picks the route from `crossSpace` and `position`. After a v1 move the page is read back, because v1 returns only an id and the caller's report needs the title and version.

Never use `before`/`after` against a top-level page. Atlassian documents that the moved page then fails to appear in the page tree.

## Inline comments

Distinct from footer comments: an inline comment is anchored to a passage of the body, carries a `resolutionStatus`, and shows up as review feedback rather than discussion at the bottom of the page.

Anchoring is the fragile part. Confluence takes the highlighted text plus a match index and a match count, and attaches the comment to the *n*-th occurrence. A wrong count silently anchors to a different passage, which is worse than an error, so `PageOperations.addInlineComment()` counts occurrences in the page's own rendered markdown when the caller does not supply a count, and refuses text that does not appear at all.

A `dangling` resolution status means the anchored text was edited away and the thread is orphaned.

## Restrictions

Read and update restrictions live only on v1, under `restriction/byOperation`.

Two things the API shape makes easy to get wrong, both handled in the connector:

- **Empty is not "locked down".** No users and no groups means the page carries no explicit restriction and inherits space permissions. `get_page_restrictions` therefore returns `inherits_space_permissions` rather than leaving the reading to the caller.
- **Clearing needs DELETE, not an empty PUT.** A PUT with empty lists is accepted but leaves the restriction records in place. `setRestrictions` sends DELETE when every list is empty.

A write is followed by a read-back, because Confluence expands the set with implicit grants (page owner, space admins) that the caller never sent and should see.

`set_page_restrictions` requires `user_approved` in both directions: adding restrictions removes access from people who had it, and clearing them exposes a page that was deliberately private.

## Blog posts

Kept as separate tools rather than a `content_type` flag on the page tools. A blog post has no parent, no tree position and cannot be moved, so half the page parameters would be meaningless on it.

Bodies use `atlas_doc_format` like pages. Atlassian's OpenAPI description carries a stale note claiming blog post creation supports only the storage representation; the `body.representation` enum on the same endpoint lists `atlas_doc_format`, and it is the representation the v2 blog post endpoints accept for both read and write.

## Whiteboards

Only the container is reachable. A whiteboard's drawing surface is a collaborative binary document with no REST representation, so `create_whiteboard` makes an *empty* board and `get_whiteboard` returns a title and a link and nothing else.

Both tool descriptions and both tool results say so explicitly. An agent that assumed otherwise would report having drawn something that does not exist.

## Body format

Two representations, and the difference matters more than it looks.

**ADF** (`atlas_doc_format`) is what the markdown path uses, so `markdownToAdf()` and `adfToMarkdown()` are reused from the Jira side unchanged. In that representation `body.value` is a JSON **string** holding the document, not a nested object; the connector stringifies on write and parses on read. A body that fails to parse yields `null`, which `adfToMarkdown` renders as `(No content)` rather than throwing.

**Storage** is Confluence's own XHTML, and it is what Confluence actually stores. Macros (`ac:structured-macro` — info and note panels, tables of contents, code blocks with a language), links to other pages (`ac:link` + `ri:page`), and attachment and image references (`ri:attachment`, `ac:image`) exist only here. Markdown has no way to express any of it.

### The space format setting

Which representation a space uses is a standing property of that space, not a per-call decision, so it lives in config.json:

```json
"spaces": {
  "DevOps": { "url": "https://site.atlassian.net", "format": "storage" },
  "DOCS":   { "url": "https://site.atlassian.net" }
},
"default_format": "markdown"
```

`format` is `markdown` (default) or `storage`, set with `confluence-mcp space set-format <KEY> <format>`, and resolved per space with `default_format` as the fallback. `formatForSpace()` reads it; `PageOperations` is constructed with it.

What it changes:

| | `markdown` | `storage` |
|---|---|---|
| `getPageDetail` default | markdown | Confluence XHTML |
| write accepts | `content`, and `storage` too | `storage` only |
| the other kind | storage always allowed, it loses nothing | markdown raises `MarkupLossError` |

Two asymmetries are deliberate:

- **Only the destructive direction is blocked.** Storage into a markdown space is fine: nothing is lost. Markdown into a storage space is refused.
- **An explicit read still wins.** `get_page` with `body_format` overrides the setting for that call. The setting picks a default; it does not forbid looking at the other representation. Enforcing reads would only make inspection harder without protecting anything.

### The markup guard

Converting a storage page to markdown and back keeps the visible prose and silently drops every macro and link. On a real space that is catastrophic and invisible: a survey of one 74-page production space found 467 macros, 237 page links and 18 attachment references.

The space setting covers a space authored elsewhere as a whole. The per-page guard below catches the same problem in a space nobody has configured yet, so both exist and they report separately, because the fix differs: one is `space set-format`, the other is `storage` on that call.

So `PageOperations.updatePage()`:

1. reads the page as **storage**, not ADF;
2. writes the body back **verbatim** when the caller changed only the title or the parent, so a rename never rewrites content;
3. **refuses** a markdown body when the current storage matches `hasStorageOnlyMarkup()` (`<ac:` or `<ri:`), raising `MarkupLossError` (`MARKUP_LOSS_REFUSED`) that names what would be lost;
4. accepts a `storage` body unconditionally, which is the route for editing macro-bearing pages;
5. honours `allowMarkupLoss` for a caller that genuinely means to replace the page.

`get_page` surfaces `has_storage_markup` so a caller can tell before it tries, and `body_format: "storage"` returns the XHTML to edit.

`movePage` uses the same storage passthrough: a move must not rewrite the body it passes over.

A page authored entirely through these tools contains no storage-only markup, so markdown works on it normally. The guard only fires on content that came from elsewhere — which is most content.

## Version conflicts

Confluence pages use optimistic locking. An update must send `version.number` exactly one above the stored version, and the request must carry the full title and body.

`PageOperations.updatePage()` therefore reads the page first and writes back whatever the caller did not supply. A title-only rename keeps the existing body; sending an empty body would blank the page.

When someone saves between the read and the write, the API answers 409 and the connector raises `VersionConflictError` (`code: VERSION_CONFLICT`). Retrying the same call would discard the other person's edit, so the tool description tells the caller to re-read the page and reapply the change.

## URL construction

Confluence returns links like `/spaces/DOCS/pages/77`, rooted at the `/wiki` context path rather than at the host. Passing that to `new URL()` against the site origin resolves it against the root and silently drops `/wiki`, producing a link that 404s in a browser. `ConfluenceConnector.wikiUrl()` strips the leading slash so the base path survives.

## Error hierarchy

Confluence errors sit beside the Jira branch under `JiraMcpError` rather than sharing a parent, because renaming the Jira branch would break every consumer matching on its `code`.

```
JiraMcpError
├── ConfluenceConnectionError    (CONFLUENCE_CONNECTION)
│   ├── ConfluenceAuthenticationError  (CONFLUENCE_AUTH)
│   └── ConfluencePermissionError      (CONFLUENCE_PERMISSION)
├── PageNotFoundError            (PAGE_NOT_FOUND)
└── VersionConflictError         (VERSION_CONFLICT)
```

Confluence answers 404 for content the account may not view, so `PageNotFoundError` deliberately says "not found (or not visible to this account)". A 404 is not proof the page is absent.

## Tool surface

All tools return the same `{ success, ... }` envelope as the Jira server. The exact count lives in README.md, which `scripts/validate_counts.py` checks against source.

| Tool | Guard | Notes |
|------|-------|-------|
| `list_spaces` | — | Site spaces plus locally configured keys |
| `get_space_language` | — | Call before writing any content |
| `search_pages` | — | `text` or `cql`; space-scoped unless `all_spaces` |
| `get_page` | — | Body as markdown, plus labels and version |
| `list_space_pages` | — | Resolves space key to id first |
| `get_page_children` | — | One level; call repeatedly to walk the tree |
| `create_page` | — | Markdown in, ADF out |
| `update_page` | — | Read-modify-write; may raise `VERSION_CONFLICT` |
| `move_page` | — | `cross_space` and sibling positions route through v1 |
| `delete_page` | `user_approved` | Moves to trash; reports the title it removed |
| `get_page_comments` | — | Footer comments as markdown |
| `add_page_comment` | `user_approved` | Optional `parent_comment_id` for replies |
| `delete_page_comment` | `user_approved` | |
| `get_page_inline_comments` | — | Anchored review threads plus unresolved count |
| `add_page_inline_comment` | `user_approved` | Verifies the anchor text exists first |
| `list_blog_posts` | — | |
| `get_blog_post` | — | Body as markdown, plus labels |
| `create_blog_post` | — | No parent; blog posts are not tree content |
| `update_blog_post` | — | Same version contract as `update_page` |
| `delete_blog_post` | `user_approved` | |
| `get_page_restrictions` | — | Returns `inherits_space_permissions` |
| `set_page_restrictions` | `user_approved` | Replaces rather than merges |
| `get_whiteboard` | — | Metadata only; content is not exposed |
| `create_whiteboard` | — | Creates an empty board |
| `delete_whiteboard` | `user_approved` | |
| `get_page_labels` | — | |
| `add_page_labels` | — | Keeps existing labels |
| `remove_page_label` | — | No guard: re-adding restores the page exactly |
| `list_attachments` | — | Metadata and download URLs, never binary content |
| `upload_attachment` | — | Max 25 MB; repeat name adds a version |

`delete_page` carries no creator check, unlike `delete_task`. Confluence page ownership is a space-permission matter and the API already refuses a delete the account may not perform.

The surface is large, and that is the cost of covering the product rather than a slice of it. It stays workable because the names are content-type-specific (`get_page`, `get_blog_post`, `get_whiteboard`) and none of them collides with a Jira tool name, which `tests/confluence/server-dispatch.test.ts` asserts.

## Dispatch

`dispatchConfluenceTool()` never throws. Argument extraction runs before a handler's own try/catch, so without a wrapper a missing parameter would escape as a transport-level JSON-RPC error while every other failure arrived as a `{ success: false, code }` envelope. Catching at the dispatch boundary gives callers one error shape to read.

## Not covered

Confluence databases, custom content types, space administration, and page-property reads.

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Configuration Reference](./configuration.md)
- [ADF Conversion](./adf.md)
