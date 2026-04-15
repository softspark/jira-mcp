/**
 * Tool handler: delete_comment
 *
 * Deletes a Jira comment only when the authenticated user is the comment author.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';
import { assertDeletionApproved } from './deletion-approval.js';

export interface DeleteCommentArgs {
  readonly task_key: string;
  readonly comment_id: string;
  readonly user_approved?: boolean;
}

export interface DeleteCommentDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

export async function handleDeleteComment(
  args: DeleteCommentArgs,
  deps: DeleteCommentDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.deleteComment(args.task_key, args.comment_id);

    return success({
      deleted: {
        task_key: result.taskKey,
        comment_id: result.commentId,
      },
      message: `Deleted comment ${args.comment_id} from ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
