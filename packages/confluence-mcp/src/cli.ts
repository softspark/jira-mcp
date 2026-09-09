// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Entry point for the `confluence-mcp` CLI binary.
 *
 * Delegates argument parsing to Commander (see {@link createConfluenceProgram}).
 * When invoked without a subcommand, the MCP server starts.
 *
 * @module
 */

import { createConfluenceProgram } from './cli/program.js';

const program = createConfluenceProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
