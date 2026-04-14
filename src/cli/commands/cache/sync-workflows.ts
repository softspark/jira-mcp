/**
 * `jira-mcp cache sync-workflows` command handler.
 *
 * Loads configuration, creates an InstancePool, and syncs workflow
 * data (statuses per issue type) for all configured projects.
 *
 * @module
 */

import type { Command } from 'commander';

import { loadConfig } from '../../../config/loader.js';
import { InstancePool } from '../../../connector/instance-pool.js';
import { WorkflowCacheManager } from '../../../cache/workflow-cache.js';
import { GLOBAL_WORKFLOWS_PATH } from '../../../config/paths.js';
import { info, error } from '../../output.js';

/** Result returned by the handler for testing. */
export interface SyncWorkflowsResult {
  readonly projectCount: number;
}

/**
 * Sync workflow data for all configured projects.
 *
 * @param cachePath - Path to the workflow cache file.
 * @returns Sync result with project count.
 */
export async function handleSyncWorkflows(
  cachePath?: string,
): Promise<SyncWorkflowsResult> {
  const config = await loadConfig();
  const pool = new InstancePool(config);
  const manager = new WorkflowCacheManager(cachePath);

  const projectCount = await manager.syncAll(pool, config);

  return { projectCount };
}

/** Register the `cache sync-workflows` subcommand. */
export function registerSyncWorkflowsCommand(parent: Command): void {
  parent
    .command('sync-workflows')
    .description('Sync workflow statuses for all configured projects')
    .action(async () => {
      try {
        const result = await handleSyncWorkflows(GLOBAL_WORKFLOWS_PATH);
        info(
          `Synced workflows for ${String(result.projectCount)} project(s).`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
