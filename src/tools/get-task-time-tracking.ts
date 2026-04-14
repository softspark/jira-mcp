/**
 * Tool handler: get_task_time_tracking
 *
 * Retrieves time tracking information (original estimate, time spent,
 * remaining estimate) for a Jira task.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface GetTaskTimeTrackingArgs {
  readonly task_key: string;
}

export interface GetTaskTimeTrackingDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Get time tracking information for a task.
 */
export async function handleGetTaskTimeTracking(
  args: GetTaskTimeTrackingArgs,
  deps: GetTaskTimeTrackingDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const tracking = await ops.getTimeTracking(args.task_key);

    return success({
      task_key: args.task_key,
      time_tracking: {
        original_estimate: tracking.originalEstimate,
        time_spent: tracking.timeSpent,
        remaining_estimate: tracking.remainingEstimate,
      },
      message: `Retrieved time tracking for ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
