// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: add_task_comment
 *
 * Adds a markdown comment to a Jira task. The markdown is converted
 * to ADF by the operations layer before sending to the Jira API.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations, resolveCommentOptions } from './helpers.js';
import { assertCommentApproved } from '@softspark/atlassian-mcp-core';
import type { JiraConfig } from '@softspark/atlassian-mcp-core';

export interface AddTaskCommentArgs {
  readonly task_key: string;
  readonly comment: string;
  readonly user_approved?: boolean;
  /** Raw client values, validated by the handler. */
  readonly visibility?: unknown;
  readonly internal?: unknown;
}

export interface AddTaskCommentDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
  readonly config: JiraConfig;
}

/**
 * Add a markdown comment to a Jira task.
 */
export async function handleAddTaskComment(
  args: AddTaskCommentArgs,
  deps: AddTaskCommentDeps,
): Promise<ToolResult> {
  try {
    assertCommentApproved(args.user_approved);
    const options = resolveCommentOptions(args, deps.config);

    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.addComment(args.task_key, args.comment, options);

    return success({
      comment: {
        id: result.commentId,
        author: result.author,
        body: result.bodyMarkdown,
        created: result.created,
        visibility: result.visibility,
        internal: result.internal,
      },
      message: `Added comment to ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
