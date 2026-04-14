/**
 * Tool handler: search_tasks
 *
 * Executes a raw JQL search against the Jira API and returns results
 * directly without caching. Useful for ad-hoc queries.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { JiraConfig } from '../config/types.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchTasksArgs {
  readonly jql: string;
  readonly max_results?: number;
  readonly project_key?: string;
}

export interface SearchTasksDeps {
  readonly pool: InstancePool;
  readonly config: JiraConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default maximum number of search results. */
const DEFAULT_MAX_RESULTS = 50;

/** Fields to request in the search response. */
const SEARCH_FIELDS: readonly string[] = [
  'summary',
  'status',
  'assignee',
  'priority',
  'issuetype',
  'created',
  'updated',
  'project',
  'customfield_10014',
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Search Jira issues using a raw JQL query.
 *
 * Returns results directly without writing to cache.
 */
export async function handleSearchTasks(
  args: SearchTasksArgs,
  deps: SearchTasksDeps,
): Promise<ToolResult> {
  try {
    const projectKey = args.project_key ?? deps.config.default_project;
    const connector = deps.pool.getConnector(projectKey);
    const maxResults = args.max_results ?? DEFAULT_MAX_RESULTS;

    const issues = await connector.searchIssues(args.jql, SEARCH_FIELDS);

    // Limit results to max_results
    const limited = issues.slice(0, maxResults);

    return success({
      results: limited,
      count: limited.length,
      total_available: issues.length,
      message: `Found ${limited.length} issue(s) matching JQL query`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
