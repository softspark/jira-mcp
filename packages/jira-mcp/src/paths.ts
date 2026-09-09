// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Path constants owned by the Jira package.
 *
 * The shared `~/.softspark/jira-mcp/` root, config.json and credentials.json
 * live in core because Confluence reads the same files. Everything here is
 * Jira's alone: the workflow and user caches, the comment and task template
 * directories, and the package-shipped `templates-system/` and `hooks/`.
 *
 * The split is not cosmetic. `PACKAGE_ROOT_DIR` is found by walking up from
 * this module's own location to the nearest package.json. Resolved from core
 * it would point at the core package, where `templates-system/` does not
 * exist, and every file-backed template would silently go missing.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GLOBAL_CACHE_DIR,
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
  GLOBAL_STATE_PATH,
} from '@softspark/atlassian-mcp-core';

/**
 * Re-exported so this package has exactly one paths module.
 *
 * Two sources would be a trap for tests: a test that redirects the config
 * directory has to mock every module the code reads it from, and a missed one
 * sends the code at the developer's real `~/.softspark/jira-mcp/`. That has
 * already happened twice in this repository.
 */
export {
  GLOBAL_CACHE_DIR,
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
  GLOBAL_STATE_PATH,
};

/**
 * Find the package root by walking up from a starting directory until we
 * find a directory containing `package.json`.
 *
 * This is necessary because tsup bundles all source files into flat output
 * files (`dist/index.js`), so the depth relative to the package root differs
 * between source layout (`src/paths.ts` -- 1 level) and bundled layout
 * (`dist/index.js` -- 1 level). Walking up finds the right root either way.
 */
function findPackageRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding package.json -- fall back to
      // the old heuristic so the server still starts (templates will be empty).
      return fileURLToPath(new URL('..', import.meta.url));
    }
    current = parent;
  }
}

/** Package root directory (works in both src/ and dist/ layouts). */
export const PACKAGE_ROOT_DIR: string = findPackageRoot(
  dirname(fileURLToPath(import.meta.url)),
);

/** Cached workflow definitions. */
export const GLOBAL_WORKFLOWS_PATH: string = join(
  GLOBAL_CACHE_DIR,
  'workflows.json',
);

/** Cached user directory. */
export const GLOBAL_USERS_PATH: string = join(GLOBAL_CACHE_DIR, 'users.json');

/** Root directory for user-defined templates. */
export const GLOBAL_TEMPLATES_DIR: string = join(
  GLOBAL_CONFIG_DIR,
  'templates',
);

/** User-defined comment templates directory. */
export const GLOBAL_COMMENT_TEMPLATES_DIR: string = join(
  GLOBAL_TEMPLATES_DIR,
  'comments',
);

/** User-defined single-task templates directory. */
export const GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR: string = join(
  GLOBAL_TEMPLATES_DIR,
  'task-templates',
);

/** Task-specific templates directory. */
export const GLOBAL_TASK_TEMPLATES_DIR: string = join(
  GLOBAL_TEMPLATES_DIR,
  'tasks',
);

/** Package-shipped system templates root directory. */
export const SYSTEM_TEMPLATES_DIR: string = join(
  PACKAGE_ROOT_DIR,
  'templates-system',
);

/** Package-shipped comment templates directory. */
export const SYSTEM_COMMENT_TEMPLATES_DIR: string = join(
  SYSTEM_TEMPLATES_DIR,
  'comments',
);

/** Package-shipped single-task templates directory. */
export const SYSTEM_TASK_TEMPLATES_DIR: string = join(
  SYSTEM_TEMPLATES_DIR,
  'task-templates',
);

/**
 * Package-shipped translations of the built-in templates.
 *
 * One directory per language code, each mirroring the layout above:
 * `locales/<lang>/comments/<id>.md`. A translation keeps the English `id` of
 * the template it replaces, so installing it overrides the shipped original.
 * Variable names stay English too, because callers pass them.
 */
export const SYSTEM_LOCALES_DIR: string = join(SYSTEM_TEMPLATES_DIR, 'locales');

/** Comment templates shipped for one language. */
export function systemLocaleCommentsDir(language: string): string {
  return join(SYSTEM_LOCALES_DIR, language, 'comments');
}

/**
 * Ensure the global config directory tree exists.
 *
 * Creates the full hierarchy if any part is missing:
 *  - ~/.softspark/jira-mcp/
 *  - ~/.softspark/jira-mcp/cache/
 *  - ~/.softspark/jira-mcp/templates/comments/
 *  - ~/.softspark/jira-mcp/templates/task-templates/
 *  - ~/.softspark/jira-mcp/templates/tasks/
 */
export async function ensureGlobalDirs(): Promise<void> {
  await mkdir(GLOBAL_CONFIG_DIR, { recursive: true, mode: 0o700 });
  await mkdir(GLOBAL_CACHE_DIR, { recursive: true, mode: 0o700 });
  await mkdir(GLOBAL_COMMENT_TEMPLATES_DIR, { recursive: true, mode: 0o700 });
  await mkdir(GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR, {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(GLOBAL_TASK_TEMPLATES_DIR, { recursive: true, mode: 0o700 });
}
