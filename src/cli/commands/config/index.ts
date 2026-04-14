/**
 * Config command group for `jira-mcp config`.
 *
 * Registers all config subcommands under a single parent command:
 *  - init            -- scaffold global config directory
 *  - add-project     -- add a project mapping
 *  - remove-project  -- remove a project mapping
 *  - list-projects   -- show all projects
 *  - set-credentials -- set API credentials
 *  - set-default     -- set default project
 *  - set-language    -- set default language
 *
 * @module
 */

import type { Command } from 'commander';

import { registerInitCommand } from './init.js';
import { registerAddProjectCommand } from './add-project.js';
import { registerRemoveProjectCommand } from './remove-project.js';
import { registerListProjectsCommand } from './list-projects.js';
import { registerSetCredentialsCommand } from './set-credentials.js';
import { registerSetDefaultCommand } from './set-default.js';
import { registerSetLanguageCommand } from './set-language.js';

/** Register all `config` subcommands on the given parent command. */
export function registerConfigCommands(parent: Command): void {
  const config = parent
    .command('config')
    .description('Manage Jira configuration');

  registerInitCommand(config);
  registerAddProjectCommand(config);
  registerRemoveProjectCommand(config);
  registerListProjectsCommand(config);
  registerSetCredentialsCommand(config);
  registerSetDefaultCommand(config);
  registerSetLanguageCommand(config);
}
