// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * CLI program setup for the `confluence-mcp` binary.
 *
 * Deliberately small. Credentials, templates and cache management stay on
 * `jira-mcp`, because both products read the same files and two commands
 * writing credentials.json would be one command too many. This binary owns
 * the MCP server and the `spaces` section of config.json.
 *
 * @module
 */

import { Command } from 'commander';

import { VERSION } from '../version.js';
import { registerSpaceCommands } from './space/index.js';

/**
 * Create and configure the `confluence-mcp` program.
 *
 * The default action (no subcommand) starts the MCP server, matching how
 * MCP clients launch a stdio server with no arguments.
 */
export function createConfluenceProgram(): Command {
  const program = new Command()
    .name('confluence-mcp')
    .description('Confluence MCP server and CLI tools')
    .version(VERSION, '-v, --version');

  program.action(async () => {
    const { startConfluenceServer } = await import('../server.js');
    await startConfluenceServer();
  });

  program
    .command('serve')
    .description('Start the MCP server (default behavior)')
    .action(async () => {
      const { startConfluenceServer } = await import('../server.js');
      await startConfluenceServer();
    });

  registerSpaceCommands(program);

  program.addHelpText(
    'after',
    `
All commands:
  serve                          Start the Confluence MCP server (default behavior)

  space add <key> <url>          Add a Confluence space mapping
  space remove <key>             Remove a space mapping
  space list                     List configured spaces
  space set-default <key>        Set the space used when space_key is omitted
  space set-language <key> <lang>  Set the content language for a space
  space set-format <key> <format>  Set the body format for a space (markdown or storage)

Credentials are shared with Jira. Set them once with:
  jira-mcp config set-credentials
`,
  );

  return program;
}
