/**
 * Cache command group for `jira-mcp cache`.
 *
 * Registers all cache subcommands under a single parent command:
 *  - sync-workflows   -- sync workflow statuses from Jira
 *  - sync-users       -- sync user data from Jira
 *  - list-workflows   -- display cached workflow statuses
 *  - list-users       -- display cached users
 *
 * @module
 */

import type { Command } from 'commander';

import { registerSyncWorkflowsCommand } from './sync-workflows.js';
import { registerSyncUsersCommand } from './sync-users.js';
import { registerListWorkflowsCommand } from './list-workflows.js';
import { registerListUsersCommand } from './list-users.js';

/** Register all `cache` subcommands on the given parent command. */
export function registerCacheCommands(parent: Command): void {
  const cache = parent
    .command('cache')
    .description('Manage workflow and user caches');

  registerSyncWorkflowsCommand(cache);
  registerSyncUsersCommand(cache);
  registerListWorkflowsCommand(cache);
  registerListUsersCommand(cache);
}
