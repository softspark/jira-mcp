/**
 * Tool handler: reassign_task
 *
 * Reassigns a Jira task to a different user by email, or unassigns
 * when an empty string (or no value) is provided.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface ReassignTaskArgs {
  readonly task_key: string;
  readonly assignee_email?: string;
}

export interface ReassignTaskDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

/**
 * Reassign a task to a user, or unassign if `assignee_email` is empty.
 */
export async function handleReassignTask(
  args: ReassignTaskArgs,
  deps: ReassignTaskDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const email = args.assignee_email?.trim() || null;
    const result = await ops.reassign(args.task_key, email);

    const message = email
      ? `Reassigned ${args.task_key} to ${email}`
      : `Unassigned ${args.task_key}`;

    return success({
      task: result.updatedTask,
      message,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
