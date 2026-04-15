/**
 * Tool handler: delete_task
 *
 * Deletes a Jira task only when the authenticated user is the task creator.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';
import { assertDeletionApproved } from './deletion-approval.js';

export interface DeleteTaskArgs {
  readonly task_key: string;
  readonly user_approved?: boolean;
}

export interface DeleteTaskDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

export async function handleDeleteTask(
  args: DeleteTaskArgs,
  deps: DeleteTaskDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.deleteTask(args.task_key);

    return success({
      deleted: {
        task_key: result.taskKey,
      },
      message: `Deleted task ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
