// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Path constants owned by the Confluence package.
 *
 * The shared `~/.softspark/jira-mcp/` root and its config files live in core,
 * because Jira reads the same ones. What is here is Confluence's alone: the
 * page templates this package ships and the user directory that overrides
 * them.
 *
 * `PACKAGE_ROOT_DIR` is found by walking up from this module to the nearest
 * package.json. Resolving it from core would find the core package, where
 * `templates-system/` does not exist, and every shipped template would
 * silently go missing.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GLOBAL_CACHE_DIR,
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
} from '@softspark/atlassian-mcp-core';

/**
 * Re-exported so this package has exactly one paths module.
 *
 * Two sources would be a trap for tests: a test that redirects the config
 * directory has to mock every module the code reads it from, and a missed one
 * sends the code at the developer's real `~/.softspark/jira-mcp/`.
 */
export {
  GLOBAL_CACHE_DIR,
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
};

/** Walk up to the nearest package.json; works in both src/ and dist/ layouts. */
function findPackageRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return fileURLToPath(new URL('..', import.meta.url));
    }
    current = parent;
  }
}

/** Package root directory. */
export const PACKAGE_ROOT_DIR: string = findPackageRoot(
  dirname(fileURLToPath(import.meta.url)),
);

/** Package-shipped page templates. */
export const SYSTEM_PAGE_TEMPLATES_DIR: string = join(
  PACKAGE_ROOT_DIR,
  'templates-system',
  'pages',
);

/** User-defined page templates, overriding shipped ones by id. */
export const GLOBAL_PAGE_TEMPLATES_DIR: string = join(
  GLOBAL_CONFIG_DIR,
  'templates',
  'pages',
);
