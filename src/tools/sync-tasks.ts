/**
 * Tool handler: sync_tasks
 *
 * Fetches tasks from Jira and persists them to the local cache.
 * By default syncs from all unique Jira instances; optionally
 * scoped to a single project.
 *
 * @module
 */

import type { TaskSyncer, SyncOptions } from '../cache/syncer.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

export interface SyncTasksArgs {
  readonly project_key?: string;
  readonly jql?: string;
}

export interface SyncTasksDeps {
  readonly syncer: TaskSyncer;
}

/**
 * Sync tasks from Jira to local cache.
 *
 * When `project_key` is omitted the syncer fetches from every unique
 * Jira instance. When specified, only the matching instance is queried.
 */
export async function handleSyncTasks(
  args: SyncTasksArgs,
  deps: SyncTasksDeps,
): Promise<ToolResult> {
  try {
    const options: SyncOptions = {
      ...(args.jql ? { jql: args.jql } : {}),
      ...(args.project_key ? { projectKey: args.project_key } : {}),
    };
    const count = await deps.syncer.sync(options);

    return success({
      tasks_synced: count,
      message: `Synced ${count} tasks`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
