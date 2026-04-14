/**
 * Tool handler: get_task_details
 *
 * Fetches full task details from the Jira API, including the
 * description and all comments converted from ADF to markdown.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { JiraConfig } from '../config/schema.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface GetTaskDetailsArgs {
  readonly task_key: string;
}

export interface GetTaskDetailsDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
  readonly config: JiraConfig;
}

/**
 * Get full task details with markdown description and comments.
 *
 * Includes the resolved project language so AI assistants know
 * which language to use when writing comments or descriptions.
 */
export async function handleGetTaskDetails(
  args: GetTaskDetailsArgs,
  deps: GetTaskDetailsDeps,
): Promise<ToolResult> {
  try {
    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const details = await ops.getTaskDetails(args.task_key);

    const projectKey = args.task_key.split('-')[0] ?? '';
    const language = deps.config.projects[projectKey]?.language
      ?? deps.config.default_language;

    return success({
      task: details,
      language,
      message: `Retrieved details for ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
