/**
 * Tool handler: get_task_statuses
 *
 * Retrieves the available workflow transitions for a task from the
 * Jira API. Useful for determining which statuses can be set before
 * calling update_task_status.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface GetTaskStatusesArgs {
  readonly task_key: string;
}

export interface GetTaskStatusesDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Get available status transitions for a task.
 */
export async function handleGetTaskStatuses(
  args: GetTaskStatusesArgs,
  deps: GetTaskStatusesDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const statuses = await ops.getAvailableStatuses(args.task_key);

    return success({
      task_key: args.task_key,
      statuses: statuses.map((s) => ({
        id: s.id,
        name: s.name,
        to_status: s.toStatus,
      })),
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
