// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for page footer comments.
 *
 * @module
 */

import {
  assertCommentApproved,
  assertDeletionApproved,
} from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps, ToolResult } from './helpers.js';
import {
  failure,
  getPageOperations,
  languageForSpace,
  success,
} from './helpers.js';

// ---------------------------------------------------------------------------
// get_page_comments
// ---------------------------------------------------------------------------

export interface GetPageCommentsArgs {
  readonly page_id: string;
  readonly space_key?: string;
  readonly limit?: number;
}

/** Read the footer comments on a page, bodies rendered as markdown. */
export async function handleGetPageComments(
  args: GetPageCommentsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const comments = await ops.getComments(args.page_id, args.limit);

    return success({
      page_id: args.page_id,
      comments,
      language: languageForSpace(deps.config, spaceKey),
      message: `Found ${String(comments.length)} comment(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// add_page_comment
// ---------------------------------------------------------------------------

export interface AddPageCommentArgs {
  readonly page_id: string;
  readonly comment: string;
  readonly parent_comment_id?: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/**
 * Add a markdown footer comment to a page.
 *
 * Requires `user_approved: true`, matching the Jira comment guard: a comment
 * is visible to everyone watching the page and cannot be unsent.
 */
export async function handleAddPageComment(
  args: AddPageCommentArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertCommentApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const comment = await ops.addComment({
      pageId: args.page_id,
      markdown: args.comment,
      ...(args.parent_comment_id !== undefined
        ? { parentCommentId: args.parent_comment_id }
        : {}),
    });

    return success({
      comment,
      message: `Added comment to page ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// delete_page_comment
// ---------------------------------------------------------------------------

export interface DeletePageCommentArgs {
  readonly comment_id: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/** Delete a footer comment. Requires `user_approved: true`. */
export async function handleDeletePageComment(
  args: DeletePageCommentArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    await ops.deleteComment(args.comment_id);

    return success({
      comment_id: args.comment_id,
      message: `Deleted comment ${args.comment_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// get_page_inline_comments
// ---------------------------------------------------------------------------

export interface GetPageInlineCommentsArgs {
  readonly page_id: string;
  readonly space_key?: string;
  readonly limit?: number;
}

/**
 * Read the inline comments anchored to text in a page.
 *
 * Separate from footer comments: these carry a `text_selection` and a
 * resolution status. A `dangling` status means the highlighted text no longer
 * exists after an edit, so the thread is orphaned.
 */
export async function handleGetPageInlineComments(
  args: GetPageInlineCommentsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const comments = await ops.getInlineComments(args.page_id, args.limit);

    const unresolved = comments.filter(
      (c) => c.resolutionStatus !== 'resolved',
    ).length;

    return success({
      page_id: args.page_id,
      inline_comments: comments,
      unresolved_count: unresolved,
      language: languageForSpace(deps.config, spaceKey),
      message: `Found ${String(comments.length)} inline comment(s), ${String(unresolved)} unresolved`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// add_page_inline_comment
// ---------------------------------------------------------------------------

export interface AddPageInlineCommentArgs {
  readonly page_id: string;
  readonly comment: string;
  readonly text_selection?: string;
  readonly match_index?: number;
  readonly parent_comment_id?: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/**
 * Anchor a markdown comment to a passage of the page, or reply to a thread.
 *
 * The occurrence count is computed from the page itself when the caller does
 * not supply it, and text that does not appear on the page is rejected rather
 * than anchored to the wrong place.
 */
export async function handleAddPageInlineComment(
  args: AddPageInlineCommentArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertCommentApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const comment = await ops.addInlineComment({
      pageId: args.page_id,
      markdown: args.comment,
      ...(args.text_selection !== undefined
        ? { textSelection: args.text_selection }
        : {}),
      ...(args.match_index !== undefined
        ? { matchIndex: args.match_index }
        : {}),
      ...(args.parent_comment_id !== undefined
        ? { parentCommentId: args.parent_comment_id }
        : {}),
    });

    return success({
      inline_comment: comment,
      message:
        args.parent_comment_id !== undefined
          ? `Replied to inline comment ${args.parent_comment_id}`
          : `Anchored an inline comment to "${args.text_selection ?? ''}" on page ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
