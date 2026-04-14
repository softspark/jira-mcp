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
import { success, failure, getOperations } from './helpers.js';

export interface AddTaskCommentArgs {
  readonly task_key: string;
  readonly comment: string;
}

export interface AddTaskCommentDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Add a markdown comment to a Jira task.
 */
export async function handleAddTaskComment(
  args: AddTaskCommentArgs,
  deps: AddTaskCommentDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.addComment(args.task_key, args.comment);

    return success({
      comment: {
        id: result.commentId,
        author: result.author,
        body: result.bodyMarkdown,
        created: result.created,
      },
      message: `Added comment to ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
