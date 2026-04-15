/**
 * CLI program setup using Commander.
 *
 * The default action (no subcommand) starts the MCP server for
 * backward compatibility. An explicit `serve` command is also
 * registered as an alias.
 *
 * @module
 */

import { Command } from 'commander';

import { VERSION } from '../version.js';
import { registerConfigCommands } from './commands/config/index.js';
import { registerCacheCommands } from './commands/cache/index.js';
import { registerCreateCommand } from './commands/create.js';
import { registerCreateMonthlyCommand } from './commands/create-monthly.js';
import { registerHookCommands } from './commands/hook/index.js';
import { registerTemplateCommands } from './commands/template/index.js';

/**
 * Create and configure the top-level Commander program.
 *
 * Registers all subcommand groups (config, etc.) and provides
 * a default action that starts the MCP server for backward
 * compatibility.
 */
export function createProgram(): Command {
  const program = new Command()
    .name('jira-mcp')
    .description('Jira MCP server and CLI tools')
    .version(VERSION, '-v, --version');

  // Default action (no subcommand) = start MCP server for backward compat
  program.action(async () => {
    const { startServer } = await import('../server.js');
    await startServer();
  });

  // Explicit 'serve' alias
  program
    .command('serve')
    .description('Start the MCP server (default behavior)')
    .action(async () => {
      const { startServer } = await import('../server.js');
      await startServer();
    });

  // Config management commands
  registerConfigCommands(program);

  // Cache management commands
  registerCacheCommands(program);

  // Bulk task creation commands
  registerCreateCommand(program);
  registerCreateMonthlyCommand(program);

  // Template management commands
  registerTemplateCommands(program);

  // Internal hook runner commands
  registerHookCommands(program);

  // Expand subcommands in --help
  program.addHelpText('after', `
All commands:
  serve                          Start the MCP server (default behavior)
  create <config-path>           Create tasks from a bulk config file (dry-run by default)
  create-monthly                 Run all monthly_admin.json configs from templates
  template add <type> <path>     Install a template override from a local markdown file
  template list [type]           List active comment/task templates
  template show <type> <id>      Show the active template file content
  template remove <type> <id>    Remove a user-installed template override

  config init                    Initialize global config at ~/.softspark/jira-mcp/
  config add-project <key> <url> Add a Jira project
  config remove-project <key>    Remove a project
  config list-projects           List configured projects
  config set-credentials         Set API credentials
  config set-default <key>       Set default project
  config set-language <lang>     Set default language (pl, en, de, es, fr, pt, it, nl)
  config set-project-language <key> <lang>  Set language for a specific project

  cache sync-workflows           Sync workflow status transitions
  cache sync-users               Sync user list
  cache list-workflows           Show cached workflows
  cache list-users               Show cached users
`);

  return program;
}
