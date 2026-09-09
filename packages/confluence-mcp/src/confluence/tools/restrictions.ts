// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for page restrictions.
 *
 * @module
 */

import { assertCommentApproved } from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps, ToolResult } from './helpers.js';
import { failure, getPageOperations, success } from './helpers.js';

// ---------------------------------------------------------------------------
// get_page_restrictions
// ---------------------------------------------------------------------------

export interface GetPageRestrictionsArgs {
  readonly page_id: string;
  readonly space_key?: string;
}

/**
 * Read who may view and edit a page.
 *
 * Empty sets mean the page inherits space permissions. That is not the same
 * as nobody having access, and the response says so explicitly so the reading
 * is not left to the caller.
 */
export async function handleGetPageRestrictions(
  args: GetPageRestrictionsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const restrictions = await ops.getRestrictions(args.page_id);

    const restricted =
      restrictions.read.users.length > 0 ||
      restrictions.read.groups.length > 0 ||
      restrictions.update.users.length > 0 ||
      restrictions.update.groups.length > 0;

    return success({
      page_id: args.page_id,
      restrictions,
      inherits_space_permissions: !restricted,
      message: restricted
        ? `Page ${args.page_id} has explicit restrictions`
        : `Page ${args.page_id} has no explicit restrictions and inherits space permissions`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// set_page_restrictions
// ---------------------------------------------------------------------------

export interface SetPageRestrictionsArgs {
  readonly page_id: string;
  readonly read_account_ids?: readonly string[];
  readonly read_group_ids?: readonly string[];
  readonly update_account_ids?: readonly string[];
  readonly update_group_ids?: readonly string[];
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/**
 * Replace the read and update restrictions on a page.
 *
 * This is a replacement, not a merge: anyone not listed loses the access they
 * had. Passing nothing at all clears the restrictions and returns the page to
 * space permissions, which can expose a page that was deliberately private.
 * Both directions change who can see the content, so this needs the same
 * explicit approval a comment does.
 */
export async function handleSetPageRestrictions(
  args: SetPageRestrictionsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertCommentApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const restrictions = await ops.setRestrictions(args.page_id, {
      readAccountIds: args.read_account_ids ?? [],
      readGroupIds: args.read_group_ids ?? [],
      updateAccountIds: args.update_account_ids ?? [],
      updateGroupIds: args.update_group_ids ?? [],
    });

    const cleared =
      restrictions.read.users.length === 0 &&
      restrictions.read.groups.length === 0 &&
      restrictions.update.users.length === 0 &&
      restrictions.update.groups.length === 0;

    return success({
      page_id: args.page_id,
      restrictions,
      message: cleared
        ? `Cleared restrictions on ${args.page_id}; it now inherits space permissions`
        : `Replaced restrictions on ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
