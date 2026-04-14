/**
 * Tool handler: read_cached_tasks
 *
 * Reads tasks from the local JSON cache without hitting the Jira API.
 * Returns either a single task or the full task list.
 *
 * @module
 */

import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

export interface ReadCachedTasksArgs {
  readonly task_key?: string;
}

export interface ReadCachedTasksDeps {
  readonly cacheManager: CacheManager;
}

/**
 * Read tasks from local cache.
 *
 * If `task_key` is provided, returns that single task; otherwise
 * returns all cached tasks with a count.
 */
export async function handleReadCachedTasks(
  args: ReadCachedTasksArgs,
  deps: ReadCachedTasksDeps,
): Promise<ToolResult> {
  try {
    if (args.task_key) {
      const task = await deps.cacheManager.getTask(args.task_key);
      return success({ task });
    }

    const tasks = await deps.cacheManager.getAllTasks();
    return success({ tasks, count: tasks.length });
  } catch (error: unknown) {
    return failure(error);
  }
}
