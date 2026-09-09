// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for page labels.
 *
 * @module
 */

import type { ConfluenceDeps, ToolResult } from './helpers.js';
import { failure, getPageOperations, success } from './helpers.js';

// ---------------------------------------------------------------------------
// get_page_labels
// ---------------------------------------------------------------------------

export interface GetPageLabelsArgs {
  readonly page_id: string;
  readonly space_key?: string;
}

/** Read the labels on a page. */
export async function handleGetPageLabels(
  args: GetPageLabelsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const labels = await ops.getLabels(args.page_id);

    return success({
      page_id: args.page_id,
      labels,
      message: `Found ${String(labels.length)} label(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// add_page_labels
// ---------------------------------------------------------------------------

export interface AddPageLabelsArgs {
  readonly page_id: string;
  readonly labels: readonly string[];
  readonly space_key?: string;
}

/** Add one or more labels to a page. Existing labels are left in place. */
export async function handleAddPageLabels(
  args: AddPageLabelsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    if (args.labels.length === 0) {
      throw new Error('Provide at least one label to add.');
    }

    const [, ops] = getPageOperations(deps, args.space_key);
    const labels = await ops.addLabels(args.page_id, args.labels);

    return success({
      page_id: args.page_id,
      labels,
      message: `Added ${String(args.labels.length)} label(s) to page ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// remove_page_label
// ---------------------------------------------------------------------------

export interface RemovePageLabelArgs {
  readonly page_id: string;
  readonly label: string;
  readonly space_key?: string;
}

/**
 * Remove one label from a page.
 *
 * No approval guard: a label is metadata and re-adding it restores the page
 * exactly, so this is not a destructive operation in the sense the delete
 * guards cover.
 */
export async function handleRemovePageLabel(
  args: RemovePageLabelArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    await ops.removeLabel(args.page_id, args.label);

    return success({
      page_id: args.page_id,
      label: args.label,
      message: `Removed label '${args.label}' from page ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
