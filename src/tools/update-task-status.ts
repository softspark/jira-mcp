/**
 * Tool handler: update_task_status
 *
 * Changes a task's workflow status via Jira's transition API
 * and updates the local cache.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface UpdateTaskStatusArgs {
  readonly task_key: string;
  readonly status: string;
}

export interface UpdateTaskStatusDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Update a task's status by executing the matching workflow transition.
 */
export async function handleUpdateTaskStatus(
  args: UpdateTaskStatusArgs,
  deps: UpdateTaskStatusDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.changeStatus(args.task_key, args.status);

    return success({
      task: result.updatedTask,
      message: `Updated ${args.task_key} status to '${args.status}'`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
