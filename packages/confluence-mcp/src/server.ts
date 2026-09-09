// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * MCP server for Confluence integration.
 *
 * A second stdio server in the same package, deliberately separate from
 * {@link ./server.ts}. Both read the same `~/.softspark/jira-mcp/config.json`
 * and the same credentials, but each advertises only its own tools: merging
 * them would put near-homonyms (`search_tasks` and `search_pages`,
 * `get_task_details` and `get_page`) in one list and make tool selection
 * measurably worse.
 *
 * Tool definitions live in {@link ./confluence/tools/definitions.ts}.
 *
 * @module
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { VERSION } from './version.js';
import { loadConfluenceConfig } from '@softspark/atlassian-mcp-core';
import { ConfluenceInstancePool } from './confluence/instance-pool.js';
import { CONFLUENCE_TOOL_DEFINITIONS } from './confluence/tools/definitions.js';
import type { ConfluenceDeps } from './confluence/tools/helpers.js';
import { failure } from '@softspark/atlassian-mcp-core';
import {
  asOptionalBoolean,
  asOptionalNumber,
  asOptionalString,
  asOptionalStringArray,
  requireString,
} from '@softspark/atlassian-mcp-core';

import {
  handleGetSpaceLanguage,
  handleListSpaces,
} from './confluence/tools/spaces.js';
import {
  handleCreatePage,
  handleDeletePage,
  handleGetPage,
  handleGetPageChildren,
  handleListSpacePages,
  handleMovePage,
  handleSearchPages,
  handleUpdatePage,
} from './confluence/tools/pages.js';
import {
  handleAddPageComment,
  handleAddPageInlineComment,
  handleDeletePageComment,
  handleGetPageComments,
  handleGetPageInlineComments,
} from './confluence/tools/comments.js';
import {
  handleCreateBlogPost,
  handleDeleteBlogPost,
  handleGetBlogPost,
  handleListBlogPosts,
  handleUpdateBlogPost,
} from './confluence/tools/blogposts.js';
import {
  handleGetPageRestrictions,
  handleSetPageRestrictions,
} from './confluence/tools/restrictions.js';
import {
  handleCreateWhiteboard,
  handleDeleteWhiteboard,
  handleGetWhiteboard,
} from './confluence/tools/whiteboards.js';
import {
  handleAddPageLabels,
  handleGetPageLabels,
  handleRemovePageLabel,
} from './confluence/tools/labels.js';
import {
  handleListAttachments,
  handleUploadAttachment,
} from './confluence/tools/attachments.js';

// Re-export for tests and for consumers listing the tool surface.
export { CONFLUENCE_TOOL_DEFINITIONS } from './confluence/tools/definitions.js';

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createConfluenceServer(): Server {
  return new Server(
    {
      name: '@softspark/confluence-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Route one tool call to its handler.
 *
 * Never throws. Argument extraction runs before a handler's own try/catch, so
 * a missing parameter would otherwise escape as a transport-level JSON-RPC
 * error while every other failure arrives as a `{ success: false, code }`
 * envelope. Catching here gives the caller one error shape to read.
 *
 * Exported separately from {@link startConfluenceServer} so tests can drive
 * every tool without standing up a stdio transport.
 */
export async function dispatchConfluenceTool(
  name: string,
  args: Record<string, unknown>,
  deps: ConfluenceDeps,
): ReturnType<typeof handleListSpaces> {
  try {
    return await routeConfluenceTool(name, args, deps);
  } catch (error: unknown) {
    return failure(error);
  }
}

async function routeConfluenceTool(
  name: string,
  args: Record<string, unknown>,
  deps: ConfluenceDeps,
): ReturnType<typeof handleListSpaces> {
  switch (name) {
    case 'list_spaces':
      return handleListSpaces(
        {
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'get_space_language':
      return handleGetSpaceLanguage(
        { space_key: asOptionalString(args['space_key']) },
        deps,
      );

    case 'search_pages':
      return handleSearchPages(
        {
          text: asOptionalString(args['text']),
          cql: asOptionalString(args['cql']),
          space_key: asOptionalString(args['space_key']),
          all_spaces: asOptionalBoolean(args['all_spaces']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'get_page':
      return handleGetPage(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          body_format: asOptionalString(args['body_format']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'list_space_pages':
      return handleListSpacePages(
        {
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'get_page_children':
      return handleGetPageChildren(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'create_page':
      return handleCreatePage(
        {
          title: requireString(args['title'], 'title'),
          content: asOptionalString(args['content']),
          storage: asOptionalString(args['storage']),
          parent_id: asOptionalString(args['parent_id']),
          draft: asOptionalBoolean(args['draft']),
          allow_markup_loss: asOptionalBoolean(args['allow_markup_loss']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'update_page':
      return handleUpdatePage(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          title: asOptionalString(args['title']),
          content: asOptionalString(args['content']),
          storage: asOptionalString(args['storage']),
          parent_id: asOptionalString(args['parent_id']),
          version_message: asOptionalString(args['version_message']),
          allow_markup_loss: asOptionalBoolean(args['allow_markup_loss']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'move_page':
      return handleMovePage(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          parent_id: requireString(args['parent_id'], 'parent_id'),
          position: asOptionalString(args['position']),
          cross_space: asOptionalBoolean(args['cross_space']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'delete_page':
      return handleDeletePage(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'get_page_comments':
      return handleGetPageComments(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'add_page_comment':
      return handleAddPageComment(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          comment: requireString(args['comment'], 'comment'),
          parent_comment_id: asOptionalString(args['parent_comment_id']),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'delete_page_comment':
      return handleDeletePageComment(
        {
          comment_id: requireString(args['comment_id'], 'comment_id'),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'get_page_inline_comments':
      return handleGetPageInlineComments(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'add_page_inline_comment':
      return handleAddPageInlineComment(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          comment: requireString(args['comment'], 'comment'),
          text_selection: asOptionalString(args['text_selection']),
          match_index: asOptionalNumber(args['match_index']),
          parent_comment_id: asOptionalString(args['parent_comment_id']),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'list_blog_posts':
      return handleListBlogPosts(
        {
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'get_blog_post':
      return handleGetBlogPost(
        {
          blog_post_id: requireString(args['blog_post_id'], 'blog_post_id'),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'create_blog_post':
      return handleCreateBlogPost(
        {
          title: requireString(args['title'], 'title'),
          content: requireString(args['content'], 'content'),
          draft: asOptionalBoolean(args['draft']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'update_blog_post':
      return handleUpdateBlogPost(
        {
          blog_post_id: requireString(args['blog_post_id'], 'blog_post_id'),
          title: asOptionalString(args['title']),
          content: asOptionalString(args['content']),
          version_message: asOptionalString(args['version_message']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'delete_blog_post':
      return handleDeleteBlogPost(
        {
          blog_post_id: requireString(args['blog_post_id'], 'blog_post_id'),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'get_page_restrictions':
      return handleGetPageRestrictions(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'set_page_restrictions':
      return handleSetPageRestrictions(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          read_account_ids: asOptionalStringArray(args['read_account_ids']),
          read_group_ids: asOptionalStringArray(args['read_group_ids']),
          update_account_ids: asOptionalStringArray(args['update_account_ids']),
          update_group_ids: asOptionalStringArray(args['update_group_ids']),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'get_whiteboard':
      return handleGetWhiteboard(
        {
          whiteboard_id: requireString(args['whiteboard_id'], 'whiteboard_id'),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'create_whiteboard':
      return handleCreateWhiteboard(
        {
          title: asOptionalString(args['title']),
          parent_id: asOptionalString(args['parent_id']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'delete_whiteboard':
      return handleDeleteWhiteboard(
        {
          whiteboard_id: requireString(args['whiteboard_id'], 'whiteboard_id'),
          user_approved: asOptionalBoolean(args['user_approved']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'get_page_labels':
      return handleGetPageLabels(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'add_page_labels':
      return handleAddPageLabels(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          labels: asOptionalStringArray(args['labels']) ?? [],
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'remove_page_label':
      return handleRemovePageLabel(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          label: requireString(args['label'], 'label'),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    case 'list_attachments':
      return handleListAttachments(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          space_key: asOptionalString(args['space_key']),
          limit: asOptionalNumber(args['limit']),
        },
        deps,
      );

    case 'upload_attachment':
      return handleUploadAttachment(
        {
          page_id: requireString(args['page_id'], 'page_id'),
          file_path: requireString(args['file_path'], 'file_path'),
          filename: asOptionalString(args['filename']),
          media_type: asOptionalString(args['media_type']),
          comment: asOptionalString(args['comment']),
          space_key: asOptionalString(args['space_key']),
        },
        deps,
      );

    default:
      return failure(new Error(`Unknown tool: ${name}`));
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

/**
 * Boot the Confluence MCP server: load config, build the pool, register
 * handlers, and connect via stdio transport.
 */
export async function startConfluenceServer(): Promise<void> {
  const config = await loadConfluenceConfig();
  const pool = new ConfluenceInstancePool(config);
  const deps: ConfluenceDeps = { pool, config };

  const server = createConfluenceServer();

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: CONFLUENCE_TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return dispatchConfluenceTool(request.params.name, args, deps);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
