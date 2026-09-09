// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for whiteboards.
 *
 * Only the container is reachable over REST. A whiteboard's drawing surface
 * is a collaborative binary document with no API representation, so these
 * tools create, locate and remove whiteboards without ever reading or writing
 * what is on them. The tool descriptions say so, because an agent that
 * assumes otherwise would report having written content that does not exist.
 *
 * @module
 */

import { assertDeletionApproved } from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps, ToolResult } from './helpers.js';
import { failure, getPageOperations, success } from './helpers.js';

// ---------------------------------------------------------------------------
// get_whiteboard
// ---------------------------------------------------------------------------

export interface GetWhiteboardArgs {
  readonly whiteboard_id: string;
  readonly space_key?: string;
}

/** Read whiteboard metadata: title, space, parent and link. */
export async function handleGetWhiteboard(
  args: GetWhiteboardArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const whiteboard = await ops.getWhiteboard(args.whiteboard_id);

    return success({
      whiteboard,
      content_available: false,
      message: `Retrieved whiteboard ${args.whiteboard_id}. Its drawing content is not exposed by the API; open the URL to view it.`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// create_whiteboard
// ---------------------------------------------------------------------------

export interface CreateWhiteboardArgs {
  readonly title?: string;
  readonly parent_id?: string;
  readonly space_key?: string;
}

/** Create an empty whiteboard. Its content cannot be seeded through the API. */
export async function handleCreateWhiteboard(
  args: CreateWhiteboardArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const whiteboard = await ops.createWhiteboard({
      spaceKey,
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.parent_id !== undefined ? { parentId: args.parent_id } : {}),
    });

    return success({
      whiteboard,
      space_key: spaceKey,
      message: `Created empty whiteboard '${whiteboard.title}' in ${spaceKey}. Content must be added in the browser.`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// delete_whiteboard
// ---------------------------------------------------------------------------

export interface DeleteWhiteboardArgs {
  readonly whiteboard_id: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/** Move a whiteboard to the trash. Requires `user_approved: true`. */
export async function handleDeleteWhiteboard(
  args: DeleteWhiteboardArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const { title } = await ops.deleteWhiteboard(args.whiteboard_id);

    return success({
      whiteboard_id: args.whiteboard_id,
      title,
      message: `Moved whiteboard '${title}' (${args.whiteboard_id}) to trash`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
