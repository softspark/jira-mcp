/**
 * `jira-mcp cache list-users` command handler.
 *
 * Loads the user cache and displays all cached users in a table,
 * deduplicated across instances.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { UserCacheManager } from '../../../cache/user-cache.js';
import type { CachedUser } from '../../../cache/user-types.js';
import { GLOBAL_CACHE_DIR } from '../../../config/paths.js';
import { info, table, error } from '../../output.js';

/**
 * List all cached users across all instances.
 *
 * @param cacheDir - Cache directory containing users.json.
 * @returns Array of deduplicated cached users.
 */
export async function handleListUsers(
  cacheDir: string,
): Promise<CachedUser[]> {
  const cachePath = join(cacheDir, 'users.json');
  const manager = new UserCacheManager(cachePath);
  await manager.load();

  return manager.getAllUsers();
}

/** Register the `cache list-users` subcommand. */
export function registerListUsersCommand(parent: Command): void {
  parent
    .command('list-users')
    .description('Show all cached Jira users')
    .action(async () => {
      try {
        const users = await handleListUsers(GLOBAL_CACHE_DIR);

        if (users.length === 0) {
          info(
            'No users cached. Run: jira-mcp cache sync-users',
          );
          return;
        }

        const tableRows = users.map((u) => [
          u.display_name,
          u.email ?? '-',
          u.account_id,
          u.active ? 'yes' : 'no',
        ]);

        table(['NAME', 'EMAIL', 'ACCOUNT ID', 'ACTIVE'], tableRows);
        info(`\n${String(users.length)} user(s) cached.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
