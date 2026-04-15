---
title: "Jira MCP Server - ADF Conversion Reference"
category: reference
service: jira-mcp
tags: [adf, atlassian-document-format, markdown, conversion]
version: "1.0.0"
created: "2026-04-13"
last_updated: "2026-04-14"
description: "Reference for Atlassian Document Format (ADF) usage, markdown conversion functions, builder helpers, and fallback behavior."
---

# Jira MCP Server - ADF Conversion Reference

## What Is ADF?

Atlassian Document Format (ADF) is the structured JSON format used by Jira Cloud's REST API v3 for rich text content. All issue descriptions and comments are stored and transmitted as ADF documents rather than plain HTML or markdown.

**ADF document shape:**

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello world" }
      ]
    }
  ]
}
```

---

## When ADF Is Used

| Direction | When | Function |
|-----------|------|----------|
| Markdown -> ADF (write) | `add_task_comment`, `add_templated_comment`, `log_task_time` (comment), bulk task descriptions | `markdownToAdf()` |
| ADF -> Markdown (read) | `get_task_details` (description + all comments) | `adfToMarkdown()` |

The MCP tools accept and return markdown strings; conversion to/from ADF is transparent to the caller.

---

## markdownToAdf()

**Source:** `src/adf/markdown-to-adf.ts`

Converts a markdown string to an ADF document using a built-in zero-dependency parser.

### Supported Markdown Features

The built-in parser handles the following elements:

- Headings (`#`, `##`, ..., `######`)
- Bold (`**text**`), italic (`*text*`), strikethrough (`~~text~~`)
- Unordered lists (`-`, `*`) and ordered lists (`1.`)
- Inline code (`` `code` ``) and fenced code blocks (` ``` `)
- Blockquotes (`> `)
- Horizontal rules (`---`)
- Links (`[text](url)`)
- Tables with a header row and delimiter row

### Fallback Behavior

| Input | Behavior |
|-------|----------|
| Empty or whitespace-only string | Returns minimal ADF with empty paragraph (no library call) |
| Conversion throws an exception | Returns plain-text fallback: raw markdown wrapped in a paragraph node |

The function never throws. Callers always receive a valid `AdfDocument`.

```typescript
// Internal fallback shape
{
  version: 1,
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: rawMarkdown }] }]
}
```

---

## adfToMarkdown()

**Source:** `src/adf/adf-to-markdown.ts`

Converts an ADF document to a markdown string using a built-in zero-dependency converter.

### Behavior by Input

| Input | Output |
|-------|--------|
| `null` or `undefined` | `"(No content)"` |
| Valid ADF, conversion succeeds, result non-empty | Trimmed markdown string |
| Valid ADF, conversion succeeds, result empty | `"(No content)"` |
| Any conversion exception | `"[ADF conversion failed]\n\n<JSON of ADF>"` |

The function never throws. The JSON fallback ensures the caller always has something displayable even when the ADF structure is unsupported.

### Limitations

- ADF panel nodes, decision lists, and some complex node types may not round-trip perfectly through the converter.
- Converted markdown is suitable for display but may not exactly reproduce the original markdown used to write the comment.

---

## ADF Builder Helpers

**Source:** `src/adf/builder.ts`

Pure functions that construct ADF nodes. No side effects, no library dependencies.

### createEmptyDoc()

Returns an ADF document containing a single empty paragraph. Required because Jira rejects documents with an empty `content` array.

```typescript
createEmptyDoc()
// -> { version: 1, type: "doc", content: [{ type: "paragraph", content: [] }] }
```

### createTextDoc(text: string)

Wraps plain text in a minimal ADF document (one paragraph, one text node).

```typescript
createTextDoc("Hello world")
// -> { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }] }
```

### wrapInPanel(doc, panelType)

Wraps an existing document's content inside an ADF panel node. The original document is not mutated.

```typescript
wrapInPanel(doc, "info")    // blue info panel
wrapInPanel(doc, "note")    // yellow note panel
wrapInPanel(doc, "warning") // orange warning panel
wrapInPanel(doc, "success") // green success panel
wrapInPanel(doc, "error")   // red error panel
```

### createHeading(text, level)

Creates an ADF heading node at the specified level (1–6).

```typescript
createHeading("Section Title", 2)
// -> { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section Title" }] }
```

### createParagraph(text, marks?)

Creates an ADF paragraph node with optional inline marks (bold, italic, code, etc.).

```typescript
createParagraph("Important", [{ type: "strong" }])
// -> { type: "paragraph", content: [{ type: "text", text: "Important", marks: [{ type: "strong" }] }] }
```

---

## ADF Type Definitions

**Source:** `src/adf/types.ts`

```typescript
interface AdfDocument {
  version: 1;
  type: "doc";
  content: AdfNode[];
}

interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: AdfMark[];
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}
```

---

## Related Documentation

- [Architecture Overview](./architecture.md)
- [Comment Templates](./templates.md)
- [API Reference](./api.md)
