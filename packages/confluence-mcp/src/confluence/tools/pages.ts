// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for pages: search, read, tree, create, update, move, delete.
 *
 * @module
 */

import { assertDeletionApproved } from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps, ToolResult } from './helpers.js';
import {
  failure,
  formatForSpace,
  getPageOperations,
  languageForSpace,
  success,
} from './helpers.js';

// ---------------------------------------------------------------------------
// search_pages
// ---------------------------------------------------------------------------

export interface SearchPagesArgs {
  readonly cql?: string;
  readonly text?: string;
  readonly space_key?: string;
  readonly limit?: number;
  readonly all_spaces?: boolean;
}

/** Escape a user string for safe embedding in a CQL double-quoted literal. */
function toCqlText(text: string): string {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `text ~ "${escaped}"`;
}

/**
 * Search Confluence content.
 *
 * Accepts either a raw `cql` query or plain `text`, which is wrapped into a
 * `text ~ "..."` clause with quotes escaped. Scoped to the resolved space
 * unless `all_spaces` is set, so an unqualified search does not silently
 * reach across every space on the site.
 */
export async function handleSearchPages(
  args: SearchPagesArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);

    const query =
      args.cql !== undefined && args.cql.length > 0
        ? args.cql
        : args.text !== undefined && args.text.length > 0
          ? toCqlText(args.text)
          : '';

    if (query.length === 0 && args.all_spaces === true) {
      throw new Error(
        'Provide cql or text when searching across all spaces.',
      );
    }

    const results =
      args.all_spaces === true
        ? await ops.search(query, args.limit)
        : await ops.searchInSpace(spaceKey, query, args.limit);

    return success({
      results,
      scope: args.all_spaces === true ? 'all spaces' : spaceKey,
      message: `Found ${String(results.length)} result(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// get_page
// ---------------------------------------------------------------------------

export interface GetPageArgs {
  readonly page_id: string;
  readonly body_format?: string;
  readonly space_key?: string;
}

/**
 * Read a page with its body converted to markdown.
 *
 * Includes the space language so an assistant editing the page writes in the
 * right one without a second call.
 */
export async function handleGetPage(
  args: GetPageArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);

    // An explicit request wins over the space setting: the setting picks the
    // default, it does not forbid looking at the other representation.
    const requested =
      args.body_format === 'storage' || args.body_format === 'markdown'
        ? args.body_format
        : undefined;
    const page = await ops.getPageDetail(args.page_id, requested);

    const warning =
      page.hasStorageMarkup && page.bodyFormat === 'markdown'
        ? ' This page contains Confluence macros or page/attachment links: edit it with update_page storage, not content, or they will be deleted.'
        : '';

    return success({
      page,
      space_format: formatForSpace(deps.config, spaceKey),
      language: languageForSpace(deps.config, spaceKey),
      message: `Retrieved page ${args.page_id} (version ${String(page.version)}).${warning}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// list_space_pages
// ---------------------------------------------------------------------------

export interface ListSpacePagesArgs {
  readonly space_key?: string;
  readonly limit?: number;
}

/** List the pages in a space. */
export async function handleListSpacePages(
  args: ListSpacePagesArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const pages = await ops.listSpacePages(spaceKey, args.limit);

    return success({
      space_key: spaceKey,
      pages,
      message: `Found ${String(pages.length)} page(s) in ${spaceKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// get_page_children
// ---------------------------------------------------------------------------

export interface GetPageChildrenArgs {
  readonly page_id: string;
  readonly space_key?: string;
  readonly limit?: number;
}

/** List the direct children of a page, for walking the page tree. */
export async function handleGetPageChildren(
  args: GetPageChildrenArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const children = await ops.getChildren(args.page_id, args.limit);

    return success({
      parent_id: args.page_id,
      children,
      message: `Found ${String(children.length)} child page(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// create_page
// ---------------------------------------------------------------------------

export interface CreatePageArgs {
  readonly title: string;
  readonly content?: string;
  readonly storage?: string;
  readonly space_key?: string;
  readonly parent_id?: string;
  readonly draft?: boolean;
  readonly allow_markup_loss?: boolean;
}

/** Create a page from markdown, or from Confluence storage XHTML. */
export async function handleCreatePage(
  args: CreatePageArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    if (args.content !== undefined && args.storage !== undefined) {
      throw new Error(
        'Provide either content (markdown) or storage (Confluence XHTML), not both.',
      );
    }

    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const result = await ops.createPage({
      spaceKey,
      title: args.title,
      ...(args.content !== undefined ? { markdown: args.content } : {}),
      ...(args.storage !== undefined ? { storage: args.storage } : {}),
      ...(args.parent_id !== undefined ? { parentId: args.parent_id } : {}),
      ...(args.draft !== undefined ? { draft: args.draft } : {}),
      ...(args.allow_markup_loss !== undefined
        ? { allowMarkupLoss: args.allow_markup_loss }
        : {}),
    });

    return success({
      page: result,
      space_key: spaceKey,
      message: `Created page '${result.title}' in ${spaceKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// update_page
// ---------------------------------------------------------------------------

export interface UpdatePageArgs {
  readonly page_id: string;
  readonly title?: string;
  readonly content?: string;
  readonly storage?: string;
  readonly parent_id?: string;
  readonly version_message?: string;
  readonly allow_markup_loss?: boolean;
  readonly space_key?: string;
}

/**
 * Update a page's title, body, or both.
 *
 * Omitted fields keep their current value. A `VERSION_CONFLICT` error means
 * somebody saved between the read and the write: re-read the page, reapply
 * the edit, and try again rather than repeating the same call.
 */
export async function handleUpdatePage(
  args: UpdatePageArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    if (
      args.title === undefined &&
      args.content === undefined &&
      args.storage === undefined &&
      args.parent_id === undefined
    ) {
      throw new Error(
        'Nothing to update: provide at least one of title, content, storage or parent_id.',
      );
    }

    if (args.content !== undefined && args.storage !== undefined) {
      throw new Error(
        'Provide either content (markdown) or storage (Confluence XHTML), not both.',
      );
    }

    const [, ops] = getPageOperations(deps, args.space_key);
    const result = await ops.updatePage({
      pageId: args.page_id,
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { markdown: args.content } : {}),
      ...(args.storage !== undefined ? { storage: args.storage } : {}),
      ...(args.parent_id !== undefined ? { parentId: args.parent_id } : {}),
      ...(args.version_message !== undefined
        ? { versionMessage: args.version_message }
        : {}),
      ...(args.allow_markup_loss !== undefined
        ? { allowMarkupLoss: args.allow_markup_loss }
        : {}),
    });

    return success({
      page: result,
      message: `Updated page ${result.id} to version ${String(result.version)}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// move_page
// ---------------------------------------------------------------------------

export interface MovePageArgs {
  readonly page_id: string;
  readonly parent_id: string;
  readonly position?: string;
  readonly cross_space?: boolean;
  readonly space_key?: string;
}

/** Positions the Confluence content-tree endpoint accepts. */
const MOVE_POSITIONS = new Set(['append', 'before', 'after']);

/**
 * Re-parent a page, optionally into a different space.
 *
 * A same-space `append` goes through the v2 update. A cross-space move or a
 * sibling position goes through the v1 content-tree endpoint, which v2 has no
 * equivalent for.
 */
export async function handleMovePage(
  args: MovePageArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const position = args.position ?? 'append';
    if (!MOVE_POSITIONS.has(position)) {
      throw new Error(
        `Invalid position '${position}'. Use 'append', 'before' or 'after'.`,
      );
    }

    const [, ops] = getPageOperations(deps, args.space_key);
    const result = await ops.movePage({
      pageId: args.page_id,
      parentId: args.parent_id,
      position: position as 'append' | 'before' | 'after',
      ...(args.cross_space !== undefined
        ? { crossSpace: args.cross_space }
        : {}),
    });

    return success({
      page: result,
      position,
      message:
        position === 'append'
          ? `Moved page ${result.id} under ${args.parent_id}`
          : `Moved page ${result.id} ${position} ${args.parent_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// delete_page
// ---------------------------------------------------------------------------

export interface DeletePageArgs {
  readonly page_id: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/**
 * Move a page to the trash.
 *
 * Requires `user_approved: true`. Unlike Jira's delete guard there is no
 * creator check: Confluence page ownership is a space-permission matter, and
 * the API already refuses a delete the account may not perform.
 */
export async function handleDeletePage(
  args: DeletePageArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const { title } = await ops.deletePage(args.page_id);

    return success({
      page_id: args.page_id,
      title,
      message: `Moved page '${title}' (${args.page_id}) to trash`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
