---
applyTo: "**"
description: Custom rule: rag-mcp-rules
---

## INSTANT ACTION RULE (GOLDEN RULE)

**ANY technical question? -> INSTANTLY call `smart_query()` OR `hybrid_search_kb()` BEFORE outputting text!**

1. **Search First:** `smart_query()` or `hybrid_search_kb()` (NEVER skip, even if you "know").
2. **Cite Sources:** always include `[PATH: kb/...]`.
3. **Strict Order:** Semantic Search -> Files -> External Docs -> General Knowledge.

Default tool: `smart_query()`. Use `hybrid_search_kb()` for speed, `crag_search()` for vague queries, `multi_hop_search()` for complex reasoning.

## kb_id vs file_path

- `get_document(path=...)` takes `kb_id` from search results (e.g., `local/softspark/project/reference/api.md`)
- `Read`/`Edit` take filesystem `file_path` (e.g., `./reference/api.md`)
- **DO NOT CONFUSE** these fields.

## SOPs

ALWAYS check `kb/procedures/` first: `smart_query("SOP for <task>")`.
