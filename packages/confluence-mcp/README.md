# confluence-mcp

> MCP server for Confluence Cloud -- pages, blog posts, comments, labels, attachments, restrictions and whiteboards via the Model Context Protocol.

[![npm](https://img.shields.io/npm/v/@softspark/confluence-mcp)](https://www.npmjs.com/package/@softspark/confluence-mcp)
[![version](https://img.shields.io/badge/version-1.14.2-blue)](../../CHANGELOG.md)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Part of the [SoftSpark Atlassian MCP workspace](https://github.com/softspark/jira-mcp), alongside [`@softspark/jira-mcp`](../jira-mcp).

---

## What's New in v1.14.2

- No behaviour change in this package: same 31 tools, same CLI, same config path. It ships because both packages are released together under one version.
- `confluence-mcp --help` now has a test behind it: the command listing is hand-written, and a registered command missing from it fails the build.
- The rest of the work is in [`@softspark/jira-mcp`](../jira-mcp): translated comment templates and a command that installs them.

---

It reads the same `~/.softspark/jira-mcp/config.json` and the same `credentials.json` as `@softspark/jira-mcp`: one Atlassian site serves both products from the same host, so the API token you already have works for both.

The two servers stay separate on purpose. Merging them would put near-homonyms (`search_tasks` next to `search_pages`, `get_task_details` next to `get_page`) in one tool list, which makes tool selection worse. Register whichever you need, or both.

## Install

```bash
npm install -g @softspark/confluence-mcp
```

## Setup

```bash
jira-mcp config set-credentials              # once, shared by both servers
confluence-mcp space add DOCS https://your-site.atlassian.net
confluence-mcp space set-language DOCS pl    # optional, inherits default_language
confluence-mcp space set-format DOCS storage # if the space already has macros
```

This adds a `spaces` section next to `projects` in the same config.json:

```json
{
  "projects": { "KAN": { "url": "https://your-site.atlassian.net" } },
  "default_project": "KAN",
  "spaces": {
    "DOCS": { "url": "https://your-site.atlassian.net", "language": "pl", "format": "storage" }
  },
  "default_space": "DOCS"
}
```

Register it alongside the Jira server:

```json
{
  "mcpServers": {
    "jira": { "command": "jira-mcp" },
    "confluence": { "command": "confluence-mcp" }
  }
}
```

## CLI commands

| Command | Description |
|---------|-------------|
| `confluence-mcp` | Start the Confluence MCP server (default) |
| `confluence-mcp serve` | Start the MCP server (explicit) |
| `confluence-mcp space add <key> <url>` | Add a Confluence space mapping |
| `confluence-mcp space remove <key>` | Remove a space mapping |
| `confluence-mcp space list` | List configured spaces |
| `confluence-mcp space set-default <key>` | Set the space used when `space_key` is omitted |
| `confluence-mcp space set-language <key> <lang>` | Set the content language for a space |
| `confluence-mcp space set-format <key> <format>` | Set the body format for a space (`markdown` or `storage`) |

Space keys keep the case Confluence stored them with: `DevOps` is not `DEVOPS`. Personal space keys start with `~`.

## Confluence tools

`space_key` is optional on every tool: it falls back to `default_space`, then to the only configured space. It becomes required only when several spaces are configured without a default, where guessing would risk writing into the wrong space.

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_spaces` | List site spaces plus the locally configured keys | `space_key?`, `limit?` |
| `get_space_language` | Get the content language and body format for a space | `space_key?` |
| `search_pages` | Search by plain text or raw CQL, scoped to one space by default | `text?`, `cql?`, `space_key?`, `all_spaces?`, `limit?` |
| `get_page` | Read a page; body in the space format, or override with `body_format` | `page_id`, `body_format?`, `space_key?` |
| `list_space_pages` | List the pages in a space | `space_key?`, `limit?` |
| `get_page_children` | List direct child pages, for walking the tree | `page_id`, `space_key?`, `limit?` |
| `list_page_templates` | List page templates usable in the space | `all_formats?`, `space_key?` |
| `create_page` | Create a page from a template, markdown, or storage XHTML | `template_id?`, `variables?`, `title?`, `content?`, `storage?`, `parent_id?` |
| `update_page` | Update title, body or parent; an untouched body is never rewritten | `page_id`, `title?`, `content?`, `storage?`, `parent_id?`, `allow_markup_loss?` |
| `move_page` | Re-parent a page, across spaces with `cross_space` | `page_id`, `parent_id`, `position?`, `cross_space?` |
| `delete_page` | Move a page to the trash | `page_id`, `user_approved`, `space_key?` |
| `get_page_comments` | Read footer comments as markdown | `page_id`, `space_key?`, `limit?` |
| `add_page_comment` | Add a markdown footer comment or reply | `page_id`, `comment`, `parent_comment_id?`, `user_approved` |
| `delete_page_comment` | Delete a footer comment | `comment_id`, `user_approved`, `space_key?` |
| `get_page_inline_comments` | Read anchored review comments with resolution status | `page_id`, `space_key?`, `limit?` |
| `add_page_inline_comment` | Anchor a comment to a passage, or reply to a thread | `page_id`, `comment`, `text_selection?`, `match_index?`, `parent_comment_id?`, `user_approved` |
| `list_blog_posts` | List blog posts in a space | `space_key?`, `limit?` |
| `get_blog_post` | Read a blog post as markdown | `blog_post_id`, `space_key?` |
| `create_blog_post` | Create a blog post from markdown | `title`, `content`, `draft?`, `space_key?` |
| `update_blog_post` | Update a blog post title, body or both | `blog_post_id`, `title?`, `content?`, `version_message?` |
| `delete_blog_post` | Move a blog post to the trash | `blog_post_id`, `user_approved`, `space_key?` |
| `get_page_restrictions` | Read who may view and edit a page | `page_id`, `space_key?` |
| `set_page_restrictions` | Replace view/edit restrictions (replaces, does not merge) | `page_id`, `read_account_ids?`, `read_group_ids?`, `update_account_ids?`, `update_group_ids?`, `user_approved` |
| `get_whiteboard` | Read whiteboard metadata (content is not exposed by the API) | `whiteboard_id`, `space_key?` |
| `create_whiteboard` | Create an empty whiteboard | `title?`, `parent_id?`, `space_key?` |
| `delete_whiteboard` | Move a whiteboard to the trash | `whiteboard_id`, `user_approved`, `space_key?` |
| `get_page_labels` | Read the labels on a page | `page_id`, `space_key?` |
| `add_page_labels` | Add labels, keeping existing ones | `page_id`, `labels`, `space_key?` |
| `remove_page_label` | Remove one label | `page_id`, `label`, `space_key?` |
| `list_attachments` | List attachment metadata and download URLs | `page_id`, `space_key?`, `limit?` |
| `upload_attachment` | Upload a local file (max 25 MB); a repeat name adds a version | `page_id`, `file_path`, `filename?`, `media_type?`, `comment?` |

## Notes

- **Two body formats, set per space.** Markdown goes through the same ADF layer Jira uses; storage is Confluence's own XHTML and is the only representation that keeps macros and page links. See [Body format](#body-format-markdown-or-storage) — read it before pointing an assistant at a space you did not create with this tool.
- **Two API versions on purpose.** CRUD runs on Confluence Cloud v2. CQL search, label writes, restrictions, multipart upload and cross-space moves run on v1, because v2 does not expose them.
- **Version conflicts are real.** `update_page` reads the page, then writes `version + 1`. If someone saves in between, the call fails with `VERSION_CONFLICT` instead of overwriting their edit. Re-read the page and reapply the change.
- **Inline comments are checked before they are anchored.** `add_page_inline_comment` counts the passage in the page body and refuses text that is not there, rather than attaching the comment to the wrong place.
- **Restrictions replace, they do not merge.** `set_page_restrictions` with no ids clears restrictions entirely and returns the page to space permissions, which can expose a deliberately private page. It needs `user_approved` for that reason.
- **Whiteboard content is not reachable.** The API exposes the container only; `create_whiteboard` makes an empty board that a person has to fill in the browser.
- **Not covered:** Confluence databases, custom content types, and space administration.

## Body format: markdown or storage

Confluence stores pages as **storage format**: XHTML carrying macros (`info`/`note`/`warning` panels, tables of contents, code blocks with a language), links to other pages, and attachment and image references. Markdown has no way to express any of that. Converting such a page to markdown and back keeps the visible prose and silently deletes the rest.

Set the format per space, once:

```bash
confluence-mcp space set-format DevOps storage    # pages are Confluence XHTML
confluence-mcp space set-format DOCS   markdown   # pages are markdown (default)
confluence-mcp space list                         # shows the format column
```

In config.json, per space or as a global default:

```json
{
  "spaces": {
    "DevOps": { "url": "https://your-site.atlassian.net", "format": "storage" },
    "DOCS":   { "url": "https://your-site.atlassian.net" }
  },
  "default_format": "markdown"
}
```

### What each setting does

| | `markdown` (default) | `storage` |
|---|---|---|
| `get_page` returns | markdown | Confluence XHTML |
| `create_page` / `update_page` take | `content` | `storage` |
| the other kind of body | `storage` is accepted too — it never loses anything | `content` is **refused** with `MARKUP_LOSS_REFUSED` |
| pages that already contain macros | markdown write refused per page | n/a, the whole space is storage |

`get_space_language` reports both the language and the format, so an assistant can ask once and then write correctly. `get_page` also returns `has_storage_markup`, which flags a macro-bearing page inside a markdown space.

### Rules that hold in both modes

- **An untouched body is never rewritten.** `update_page` that changes only the title or the parent writes the existing body back byte for byte.
- **An explicit read wins.** `get_page` with `body_format` overrides the space setting for that one call; the setting picks the default, it does not forbid looking.
- **The escape hatch is explicit.** `allow_markup_loss: true` lets markdown through in a storage space, or over a macro-bearing page. Use it only after the user agrees the macros and links may go.

If your space is managed as code (HTML files pushed via the REST API, as `sync.py` does), it is a `storage` space. Set it before pointing an assistant at it.

## Page templates

`list_page_templates` shows what is available for a space, filtered to its body format because a storage template cannot render into a markdown space or the reverse. `create_page` then takes `template_id` and `variables`; the template supplies the title, the body and the format, so do not also pass `title`, `content` or `storage`.

| ID | Format | Use for |
|----|--------|---------|
| `runbook` | markdown | Operational procedure: when to run it, prerequisites, steps, verification, rollback |
| `incident-review` | markdown | Blameless post-incident review: impact, timeline, root cause, actions |
| `decision-record` | storage | ADR built from Confluence status and info macros |

Variables use `{{name}}`, and `{{#name}}...{{/name}}` keeps a block only when the variable is supplied. Both the title and the body are rendered, so a variable can appear in either.

Drop your own templates in `~/.softspark/jira-mcp/templates/pages/*.md`; one with the same `id` as a shipped template replaces it. A malformed file is skipped rather than breaking startup.

## Documentation

- [Confluence reference](../../kb/reference/confluence.md) -- architecture, API split, ADF and storage formats, restrictions, version conflicts.
- [Changelog](../../CHANGELOG.md) -- shared with `@softspark/jira-mcp`; both packages are released together under one version.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
