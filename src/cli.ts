/**
 * Entry point for the `jira-mcp` CLI binary.
 *
 * Delegates all argument parsing to Commander (see {@link createProgram}).
 * When invoked without a subcommand, the MCP server starts automatically
 * for backward compatibility.
 *
 * @module
 */

import { createProgram } from './cli/index.js';

const program = createProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
