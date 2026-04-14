/**
 * `jira-mcp cache list-workflows <project>` command handler.
 *
 * Loads the workflow cache and displays statuses grouped by issue type
 * for the specified project.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { WorkflowCacheManager } from '../../../cache/workflow-cache.js';
import { GLOBAL_CACHE_DIR } from '../../../config/paths.js';
import { info, table, error } from '../../output.js';

/** Row data returned for external consumption (testing). */
export interface WorkflowListRow {
  readonly issueType: string;
  readonly statuses: readonly string[];
}

/** Result of the list-workflows handler. */
export interface WorkflowListResult {
  readonly projectKey: string;
  readonly rows: readonly WorkflowListRow[];
}

/**
 * List cached workflow statuses for a project.
 *
 * @param cacheDir - Cache directory containing workflows.json.
 * @param projectKey - Project key to look up.
 * @returns Workflow data grouped by issue type.
 */
export async function handleListWorkflows(
  cacheDir: string,
  projectKey: string,
): Promise<WorkflowListResult> {
  const cachePath = join(cacheDir, 'workflows.json');
  const manager = new WorkflowCacheManager(cachePath);
  await manager.load();

  const workflow = manager.getProjectWorkflow(projectKey);
  if (!workflow) {
    return { projectKey, rows: [] };
  }

  const rows: WorkflowListRow[] = Object.entries(workflow.issue_types).map(
    ([issueType, data]) => ({
      issueType,
      statuses: data.statuses,
    }),
  );

  return { projectKey, rows };
}

/** Register the `cache list-workflows` subcommand. */
export function registerListWorkflowsCommand(parent: Command): void {
  parent
    .command('list-workflows <project>')
    .description('Show cached workflow statuses for a project')
    .action(async (projectKey: string) => {
      try {
        const result = await handleListWorkflows(GLOBAL_CACHE_DIR, projectKey);

        if (result.rows.length === 0) {
          info(
            `No workflow data cached for project '${projectKey}'. Run: jira-mcp cache sync-workflows`,
          );
          return;
        }

        const tableRows = result.rows.map((r) => [
          r.issueType,
          r.statuses.join(', '),
        ]);

        table(['ISSUE TYPE', 'STATUSES'], tableRows);
        info(
          `\n${String(result.rows.length)} issue type(s) for project '${projectKey}'.`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
