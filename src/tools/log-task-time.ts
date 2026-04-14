/**
 * Tool handler: log_task_time
 *
 * Logs work time to a Jira task. Accepts human-readable time
 * format ("2h 30m") and an optional work description.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface LogTaskTimeArgs {
  readonly task_key: string;
  readonly time_spent: string;
  readonly comment?: string;
}

export interface LogTaskTimeDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Log work time on a task with an optional comment.
 */
export async function handleLogTaskTime(
  args: LogTaskTimeArgs,
  deps: LogTaskTimeDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.logTime(
      args.task_key,
      args.time_spent,
      args.comment,
    );

    return success({
      message: `Logged ${args.time_spent} to ${args.task_key}`,
      worklog_id: result.worklogId,
      time_spent: result.timeSpent,
      time_spent_seconds: result.timeSpentSeconds,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
