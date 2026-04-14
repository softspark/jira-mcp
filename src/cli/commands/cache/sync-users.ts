/**
 * `jira-mcp cache sync-users` command handler.
 *
 * Loads configuration, creates an InstancePool, and syncs user data
 * from all unique Jira instances.
 *
 * @module
 */

import type { Command } from 'commander';

import { loadConfig } from '../../../config/loader.js';
import { InstancePool } from '../../../connector/instance-pool.js';
import { UserCacheManager } from '../../../cache/user-cache.js';
import { GLOBAL_USERS_PATH } from '../../../config/paths.js';
import { info, error } from '../../output.js';

/** Result returned by the handler for testing. */
export interface SyncUsersResult {
  readonly userCount: number;
}

/**
 * Sync user data from all configured Jira instances.
 *
 * @param cachePath - Path to the user cache file.
 * @returns Sync result with user count.
 */
export async function handleSyncUsers(
  cachePath?: string,
): Promise<SyncUsersResult> {
  const config = await loadConfig();
  const pool = new InstancePool(config);
  const manager = new UserCacheManager(cachePath);

  const userCount = await manager.syncAll(pool);

  return { userCount };
}

/** Register the `cache sync-users` subcommand. */
export function registerSyncUsersCommand(parent: Command): void {
  parent
    .command('sync-users')
    .description('Sync users from all configured Jira instances')
    .action(async () => {
      try {
        const result = await handleSyncUsers(GLOBAL_USERS_PATH);
        info(`Synced ${String(result.userCount)} user(s).`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
