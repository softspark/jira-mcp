// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * MCP tool definitions for the Confluence MCP server.
 *
 * Names are deliberately page/space-shaped (`get_page`, not `get_content`)
 * so that a client running both servers side by side never has two tools
 * whose names could plausibly describe the same call.
 *
 * `space_key` is optional everywhere: it falls back to `default_space`, and
 * then to the single configured space. It becomes required only when several
 * spaces are configured without a default.
 *
 * @module
 */

import type { ToolDefinition } from '@softspark/atlassian-mcp-core';

/** Shared description for the optional space routing parameter. */
const SPACE_KEY_PROP = {
  type: 'string',
  description:
    'Optional space key (e.g. "DOCS"). Defaults to the configured default_space, or to the only configured space.',
} as const;

/** Shared description for the result-count cap. */
const LIMIT_PROP = {
  type: 'number',
  description: 'Maximum number of results (1-250, default 25).',
} as const;

export const CONFLUENCE_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  // -------------------------------------------------------------------
  // Spaces
  // -------------------------------------------------------------------
  {
    name: 'list_spaces',
    description:
      'List Confluence spaces visible to the account, alongside the space keys configured locally. Only configured keys can route a write.',
    inputSchema: {
      type: 'object',
      properties: {
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
    },
  },
  {
    name: 'get_space_language',
    description:
      'Get the content language AND body format configured for a space. Call this before writing anything: write content in the returned language, and when body_format is "storage" send bodies as Confluence XHTML via the storage parameter rather than markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        space_key: SPACE_KEY_PROP,
      },
    },
  },

  // -------------------------------------------------------------------
  // Pages — read
  // -------------------------------------------------------------------
  {
    name: 'search_pages',
    description:
      'Search Confluence content. Pass plain "text" for a full-text search, or a raw "cql" query for precise filtering. Scoped to one space unless all_spaces is true.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'Plain search text. Wrapped into a CQL text ~ "..." clause with quotes escaped.',
        },
        cql: {
          type: 'string',
          description:
            'Raw CQL query (e.g. \'type = page AND label = "runbook"\'). Takes precedence over text.',
        },
        space_key: SPACE_KEY_PROP,
        all_spaces: {
          type: 'boolean',
          description:
            'Search every space instead of scoping to one. Requires text or cql.',
        },
        limit: LIMIT_PROP,
      },
    },
  },
  {
    name: 'get_page',
    description:
      'Get a page by id with its body, labels, version number and the space language. Returns has_storage_markup: when true the page uses Confluence macros or page/attachment links, and must be edited as storage rather than markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'Numeric page id (e.g. "123456789").',
        },
        body_format: {
          type: 'string',
          enum: ['markdown', 'storage'],
          description:
            'Overrides the space setting for this one read. Defaults to the space format (see get_space_language). "markdown" is readable but lossy; "storage" returns Confluence XHTML, which is what you must edit and send back when a page has macros.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'list_space_pages',
    description: 'List the pages in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
    },
  },
  {
    name: 'get_page_children',
    description:
      'List the direct child pages of a page. Call repeatedly to walk the page tree.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: {
          type: 'string',
          description: 'Numeric id of the parent page.',
        },
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
      required: ['page_id'],
    },
  },

  // -------------------------------------------------------------------
  // Pages — write
  // -------------------------------------------------------------------
  {
    name: 'create_page',
    description:
      'Create a Confluence page. Provide content (markdown) or storage (Confluence XHTML), matching the space body_format from get_space_language. In a storage space, markdown is refused. Write the text in the language get_space_language returns.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Page title.' },
        content: {
          type: 'string',
          description:
            'Page body in markdown. Converted to ADF before sending. Use in markdown-format spaces.',
        },
        storage: {
          type: 'string',
          description:
            'Page body as Confluence storage XHTML. Use in storage-format spaces, and whenever the page needs macros, panels, page links or attachments.',
        },
        parent_id: {
          type: 'string',
          description:
            'Optional parent page id. Defaults to the space homepage when omitted.',
        },
        draft: {
          type: 'boolean',
          description: 'Create as an unpublished draft instead of a live page.',
        },
        allow_markup_loss: {
          type: 'boolean',
          description:
            'Create a markdown page in a storage-format space anyway. Only after the user agrees to the mixed representation.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['title'],
    },
  },
  {
    name: 'update_page',
    description:
      'Update a page title, body or parent. An omitted body is left byte-for-byte untouched. A markdown body is REFUSED with MARKUP_LOSS_REFUSED when the page contains Confluence macros or page/attachment links, because converting would silently delete them: read the page with body_format=storage, edit that XHTML, and send it back as storage. On VERSION_CONFLICT, re-read and reapply rather than retrying.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        title: { type: 'string', description: 'New title. Omit to keep the current one.' },
        content: {
          type: 'string',
          description:
            'New body in markdown. Replaces the body entirely. Safe only on pages without macros.',
        },
        storage: {
          type: 'string',
          description:
            'New body as Confluence storage XHTML. Use this to edit pages that contain macros, panels, page links or attachments. Mutually exclusive with content.',
        },
        parent_id: {
          type: 'string',
          description: 'Move the page under a different parent in the same space.',
        },
        version_message: {
          type: 'string',
          description: 'Optional note stored with the new version.',
        },
        allow_markup_loss: {
          type: 'boolean',
          description:
            'Override the macro guard and let a markdown body replace storage markup. Only after the user confirms the macros and links may be deleted.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'move_page',
    description:
      'Re-parent a page, leaving title and body untouched. Set cross_space=true to move it under a page in a different space, which also moves it out of its current one.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric id of the page to move.' },
        parent_id: {
          type: 'string',
          description:
            'Numeric id of the target page. With position "append" it becomes the new parent; with "before"/"after" it becomes a sibling.',
        },
        position: {
          type: 'string',
          enum: ['append', 'before', 'after'],
          description:
            'Where to place the page relative to the target. Default "append" (become its child). Never use before/after against a top-level page: the result does not show in the page tree.',
        },
        cross_space: {
          type: 'boolean',
          description:
            'Set true when the target page is in a different space. The page moves into the target\'s space.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'parent_id'],
    },
  },
  {
    name: 'delete_page',
    description:
      'Move a page to the trash. Requires user_approved=true, which may only be set after the user explicitly confirms the deletion.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        user_approved: {
          type: 'boolean',
          description:
            'Must be true. Set it only after the user confirms this specific deletion.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'user_approved'],
    },
  },

  // -------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------
  {
    name: 'get_page_comments',
    description:
      'Read the footer comments on a page, with bodies converted to markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'add_page_comment',
    description:
      'Add a markdown footer comment to a page. Requires user_approved=true, set only after the user accepts the comment text.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        comment: { type: 'string', description: 'Comment body in markdown.' },
        parent_comment_id: {
          type: 'string',
          description: 'Reply to this comment instead of starting a new thread.',
        },
        user_approved: {
          type: 'boolean',
          description: 'Must be true. Set it only after the user accepts the content.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'comment', 'user_approved'],
    },
  },
  {
    name: 'delete_page_comment',
    description:
      'Delete a footer comment. Requires user_approved=true, set only after the user confirms the deletion.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: { type: 'string', description: 'Numeric comment id.' },
        user_approved: {
          type: 'boolean',
          description: 'Must be true. Set it only after the user confirms.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['comment_id', 'user_approved'],
    },
  },

  {
    name: 'get_page_inline_comments',
    description:
      'Read the inline comments anchored to text in a page, with their highlighted passage and resolution status. Distinct from footer comments. A "dangling" status means the highlighted text was edited away and the thread is orphaned.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'add_page_inline_comment',
    description:
      'Anchor a markdown comment to a passage of a page, or reply to an existing inline thread. Requires user_approved=true. text_selection must appear verbatim in the page body; text that is not found is rejected rather than anchored elsewhere.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        comment: { type: 'string', description: 'Comment body in markdown.' },
        text_selection: {
          type: 'string',
          description:
            'The exact passage to highlight. Required for a new thread, omit when replying.',
        },
        match_index: {
          type: 'number',
          description:
            'Zero-based occurrence to highlight when the passage appears more than once. Default 0 (the first).',
        },
        parent_comment_id: {
          type: 'string',
          description: 'Reply to this inline comment instead of starting a thread.',
        },
        user_approved: {
          type: 'boolean',
          description: 'Must be true. Set it only after the user accepts the content.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'comment', 'user_approved'],
    },
  },

  // -------------------------------------------------------------------
  // Blog posts
  // -------------------------------------------------------------------
  {
    name: 'list_blog_posts',
    description: 'List blog posts in a space.',
    inputSchema: {
      type: 'object',
      properties: {
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
    },
  },
  {
    name: 'get_blog_post',
    description:
      'Read a blog post by id with its body converted to markdown, plus labels and version.',
    inputSchema: {
      type: 'object',
      properties: {
        blog_post_id: { type: 'string', description: 'Numeric blog post id.' },
        space_key: SPACE_KEY_PROP,
      },
      required: ['blog_post_id'],
    },
  },
  {
    name: 'create_blog_post',
    description:
      'Create a blog post from markdown. Blog posts have no parent and cannot be moved; use create_page for tree content.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Blog post title.' },
        content: { type: 'string', description: 'Body in markdown.' },
        draft: {
          type: 'boolean',
          description: 'Create as an unpublished draft.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_blog_post',
    description:
      'Update a blog post title, body or both. Omitted fields keep their current value. Same VERSION_CONFLICT handling as update_page.',
    inputSchema: {
      type: 'object',
      properties: {
        blog_post_id: { type: 'string', description: 'Numeric blog post id.' },
        title: { type: 'string', description: 'New title. Omit to keep it.' },
        content: {
          type: 'string',
          description: 'New body in markdown. Omit to keep it. Replaces the body entirely.',
        },
        version_message: {
          type: 'string',
          description: 'Optional note stored with the new version.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['blog_post_id'],
    },
  },
  {
    name: 'delete_blog_post',
    description:
      'Move a blog post to the trash. Requires user_approved=true, set only after the user confirms.',
    inputSchema: {
      type: 'object',
      properties: {
        blog_post_id: { type: 'string', description: 'Numeric blog post id.' },
        user_approved: {
          type: 'boolean',
          description: 'Must be true. Set it only after the user confirms.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['blog_post_id', 'user_approved'],
    },
  },

  // -------------------------------------------------------------------
  // Restrictions
  // -------------------------------------------------------------------
  {
    name: 'get_page_restrictions',
    description:
      'Read who may view and edit a page. Empty lists with inherits_space_permissions=true mean the page has no explicit restrictions, not that nobody can read it.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'set_page_restrictions',
    description:
      'Replace the read and edit restrictions on a page. This REPLACES, it does not merge: anyone not listed loses access. Passing no ids at all clears the restrictions and exposes the page to everyone with space access. Requires user_approved=true.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        read_account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Atlassian account ids allowed to view the page.',
        },
        read_group_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Group ids allowed to view the page.',
        },
        update_account_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Atlassian account ids allowed to edit the page.',
        },
        update_group_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Group ids allowed to edit the page.',
        },
        user_approved: {
          type: 'boolean',
          description:
            'Must be true. Set it only after the user confirms this access change.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'user_approved'],
    },
  },

  // -------------------------------------------------------------------
  // Whiteboards
  // -------------------------------------------------------------------
  {
    name: 'get_whiteboard',
    description:
      'Read whiteboard metadata: title, space, parent and link. The drawing content is NOT available over the API and is never returned.',
    inputSchema: {
      type: 'object',
      properties: {
        whiteboard_id: { type: 'string', description: 'Numeric whiteboard id.' },
        space_key: SPACE_KEY_PROP,
      },
      required: ['whiteboard_id'],
    },
  },
  {
    name: 'create_whiteboard',
    description:
      'Create an EMPTY whiteboard. Its drawing content cannot be set through the API; a person must add it in the browser. Do not claim to have drawn anything.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Whiteboard title.' },
        parent_id: {
          type: 'string',
          description: 'Optional parent page id in the same space.',
        },
        space_key: SPACE_KEY_PROP,
      },
    },
  },
  {
    name: 'delete_whiteboard',
    description:
      'Move a whiteboard to the trash. Requires user_approved=true, set only after the user confirms.',
    inputSchema: {
      type: 'object',
      properties: {
        whiteboard_id: { type: 'string', description: 'Numeric whiteboard id.' },
        user_approved: {
          type: 'boolean',
          description: 'Must be true. Set it only after the user confirms.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['whiteboard_id', 'user_approved'],
    },
  },

  // -------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------
  {
    name: 'get_page_labels',
    description: 'Read the labels on a page.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'add_page_labels',
    description: 'Add one or more labels to a page. Existing labels are kept.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label names to add.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'labels'],
    },
  },
  {
    name: 'remove_page_label',
    description: 'Remove one label from a page.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        label: { type: 'string', description: 'Label name to remove.' },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'label'],
    },
  },

  // -------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------
  {
    name: 'list_attachments',
    description:
      'List attachment metadata for a page: names, media types, sizes and download URLs. Binary content is never returned inline.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        space_key: SPACE_KEY_PROP,
        limit: LIMIT_PROP,
      },
      required: ['page_id'],
    },
  },
  {
    name: 'upload_attachment',
    description:
      'Upload a local file as a page attachment. Re-uploading an existing filename adds a new version of that attachment. Files above 25 MB are rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Numeric page id.' },
        file_path: {
          type: 'string',
          description: 'Path to a local file to upload.',
        },
        filename: {
          type: 'string',
          description:
            'Optional stored name. Only the basename is used. Defaults to the source filename.',
        },
        media_type: {
          type: 'string',
          description: 'Optional MIME type (e.g. "image/png").',
        },
        comment: {
          type: 'string',
          description: 'Optional note stored with the attachment version.',
        },
        space_key: SPACE_KEY_PROP,
      },
      required: ['page_id', 'file_path'],
    },
  },
];
