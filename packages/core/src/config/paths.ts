// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Global paths shared by every Atlassian MCP server in this workspace.
 *
 * One Atlassian site backs both products, so both read the same files under
 * `~/.softspark/jira-mcp/`:
 *  - config.json       -- projects (Jira) and spaces (Confluence)
 *  - credentials.json  -- one email and API token for the site
 *  - cache/            -- per-product cache files
 *  - state.json        -- runtime state
 *
 * The directory keeps its `jira-mcp` name for compatibility: renaming it
 * would orphan every existing installation's configuration.
 *
 * Product-specific paths do NOT belong here. Anything derived from the
 * package root (`templates-system/`, `hooks/`) must be resolved inside the
 * package that ships those files, or the walk finds the wrong package.json.
 * See `packages/jira-mcp/src/paths.ts`.
 *
 * @module
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Root directory for all Jira MCP global state. */
export const GLOBAL_CONFIG_DIR: string = join(
  homedir(),
  '.softspark',
  'jira-mcp',
);

/** Global config.json path. */
export const GLOBAL_CONFIG_PATH: string = join(GLOBAL_CONFIG_DIR, 'config.json');

/** Global credentials.json path. */
export const GLOBAL_CREDENTIALS_PATH: string = join(
  GLOBAL_CONFIG_DIR,
  'credentials.json',
);

/** Cache directory for workflows, users, etc. */
export const GLOBAL_CACHE_DIR: string = join(GLOBAL_CONFIG_DIR, 'cache');

/** Persistent runtime state. */
export const GLOBAL_STATE_PATH: string = join(GLOBAL_CONFIG_DIR, 'state.json');
