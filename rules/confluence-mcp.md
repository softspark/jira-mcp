# Confluence MCP Server

Tools: `list_spaces`, `get_space_language`, `search_pages`, `get_page`, `list_space_pages`, `get_page_children`, `list_page_templates`, `create_page`, `update_page`, `move_page`, `delete_page`, `get_page_comments`, `add_page_comment`, `delete_page_comment`, `get_page_inline_comments`, `add_page_inline_comment`, `list_blog_posts`, `get_blog_post`, `create_blog_post`, `update_blog_post`, `delete_blog_post`, `get_page_restrictions`, `set_page_restrictions`, `get_whiteboard`, `create_whiteboard`, `delete_whiteboard`, `get_page_labels`, `add_page_labels`, `remove_page_label`, `list_attachments`, `upload_attachment`

## Key Rules

- **Ask the space first:** call `get_space_language(space_key)` before writing anything. It returns both the language to write in and the `body_format` the space uses. Never assume Polish or English, and never assume markdown.
- **Body format decides which parameter you send.** `body_format: "markdown"` means send `content`. `body_format: "storage"` means send `storage`, holding Confluence XHTML. Sending markdown into a storage space fails with `MARKUP_LOSS_REFUSED`, and that refusal is protecting real content.
- **Editing an existing page:** read it with `get_page`. If `has_storage_markup` is true, the page holds macros, page links or attachment references. Read it again with `body_format: "storage"`, edit that XHTML, and send it back as `storage`. Converting to markdown keeps the prose and deletes everything else.
- **Renames and moves never touch the body.** `update_page` with only `title` or `parent_id` writes the existing body back byte for byte. Do not re-send the body just to change a title.
- **`allow_markup_loss=true` is a last resort.** It lets markdown overwrite storage markup. Only after the user has been told which macros and links will be deleted and has agreed.
- **Version conflicts:** `update_page` sends `version + 1`. A `VERSION_CONFLICT` means somebody saved in between. Re-read the page and reapply the change; never retry the same call, it would discard their edit.
- **Space key routes the site:** unlike a Jira issue key, a page id carries no space. `space_key` falls back to `default_space`, then to the only configured space. With several spaces and no default, name one.
- **Space keys keep their case.** `DevOps` is not `DEVOPS`. Use the key exactly as configured.
- **Templates:** call `list_page_templates` to see what is available for the space, then `create_page` with `template_id` and `variables`. The template supplies the title, body and format, so do not also pass `title`, `content` or `storage`.
- **Inline comments must anchor to text that exists.** `add_page_inline_comment` verifies `text_selection` against the page and refuses text it cannot find, rather than attaching the comment to the wrong passage.
- **Restrictions replace, they never merge.** `set_page_restrictions` with no ids clears them and exposes the page to everyone with space access. Requires `user_approved=true` in both directions.
- **Delete guard:** `delete_page`, `delete_blog_post`, `delete_page_comment` and `delete_whiteboard` require explicit `user_approved=true`, set only after the user confirms that specific deletion.
- **Whiteboard content is not reachable.** The API exposes the container only. `create_whiteboard` makes an empty board. Never report having drawn anything.
- **Search is scoped to one space** unless `all_spaces=true`. Pass plain `text` for a full-text search, or raw `cql` for precise filtering.

## Writing Style

- **Write like a real team member:** plain, direct language that reads like an engineer writing to another human, not polished AI copy.
- **No em dash and no double-hyphen separator in prose:** use commas, periods or parentheses instead.
- **Avoid stock AI phrases:** no "worth noting", "it is important to understand", "overall", "in conclusion" or similar filler.
- **Prefer concrete wording:** specific facts, actions, examples and decisions over abstract claims.
- **Avoid repetitive rhythm:** vary sentence length and openings in longer text.
- **Use a workmanlike tone:** slightly rough and practical beats smooth and symmetrical.

## Workflow

1. `get_space_language(space_key="DOCS")` to learn the language and body format
2. `search_pages(text="...")` or `list_space_pages()` to locate content
3. `get_page(page_id="...")` to read; add `body_format: "storage"` when you intend to edit a page with macros
4. `list_page_templates()` before authoring something new
5. `create_page(...)` / `update_page(...)` / `add_page_comment(...)` to write

## Built-in Page Templates

| ID | Format | Use for |
|----|--------|---------|
| `runbook` | markdown | Operational procedure: when to run it, prerequisites, steps, verification, rollback |
| `incident-review` | markdown | Blameless post-incident review: impact, timeline, root cause, actions |
| `decision-record` | storage | ADR using Confluence status and info macros |

User templates in `~/.softspark/jira-mcp/templates/pages/*.md` override a shipped template of the same id.

## CLI Commands

| Command | Description |
|---------|-------------|
| `confluence-mcp` | Start MCP server (default) |
| `confluence-mcp serve` | Start MCP server (explicit) |
| `confluence-mcp space add <key> <url>` | Add a Confluence space mapping |
| `confluence-mcp space remove <key>` | Remove a space |
| `confluence-mcp space list` | Show configured spaces with language and format |
| `confluence-mcp space set-default <key>` | Set the space used when `space_key` is omitted |
| `confluence-mcp space set-language <key> <lang>` | Set the content language for a space |
| `confluence-mcp space set-format <key> <format>` | Set the body format (`markdown` or `storage`) |

Credentials are shared with Jira: set them once with `jira-mcp config set-credentials`.

## Configuration

One `~/.softspark/jira-mcp/config.json` serves both products. `projects` routes Jira, `spaces` routes Confluence:

```json
{
  "projects": { "KAN": { "url": "https://site.atlassian.net" } },
  "default_project": "KAN",
  "spaces": {
    "DevOps": { "url": "https://site.atlassian.net", "language": "en", "format": "storage" }
  },
  "default_space": "DevOps",
  "default_format": "markdown"
}
```

## Architecture

Same four layers as the Jira server, sharing the bottom two through `@softspark/atlassian-mcp-core`.

1. **Types & Config** (`core/config`, `core/errors`) — one config.json and one credentials.json for both products
2. **Infrastructure** (`confluence/connector`, `core/adf`, `core/http`) — v2 for CRUD, v1 for CQL search, label writes, restrictions, multipart upload and cross-space moves
3. **Business Logic** (`confluence/page-operations`, `templates/registry`) — the markdown boundary, read-modify-write, and the markup guards
4. **Entry Points** (`confluence/tools`, `cli`, `server.ts`) — thin dispatchers

## Docs

- `kb/reference/confluence.md` — architecture, API split, body formats, restrictions, version conflicts
- `packages/confluence-mcp/README.md` — install, configuration, full tool reference
