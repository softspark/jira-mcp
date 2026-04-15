/**
 * Global path constants for Jira MCP configuration.
 *
 * All persistent state lives under `~/.softspark/jira-mcp/`:
 *  - config.json / credentials.json  -- user configuration
 *  - cache/                          -- cached workflows, users
 *  - templates/tasks/                -- user-defined task templates
 *  - state.json                      -- runtime state
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root directory for all Jira MCP global state. */
export const GLOBAL_CONFIG_DIR: string = join(
  homedir(),
  '.softspark',
  'jira-mcp',
);

/**
 * Find the package root by walking up from a starting directory until we
 * find a directory containing `package.json`.
 *
 * This is necessary because tsup bundles all source files into flat output
 * files (`dist/index.js`), so the depth relative to the package root differs
 * between source layout (`src/config/paths.ts` -- 2 levels) and bundled
 * layout (`dist/index.js` -- 1 level).  A static `../..` only works for
 * the source layout and silently resolves to the wrong directory after
 * bundling, causing file-backed templates to go missing.
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
      return fileURLToPath(new URL('../..', import.meta.url));
    }
    current = parent;
  }
}

/** Package root directory (works in both src/ and dist/ layouts). */
export const PACKAGE_ROOT_DIR: string = findPackageRoot(
  dirname(fileURLToPath(import.meta.url)),
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

/** Cached workflow definitions. */
export const GLOBAL_WORKFLOWS_PATH: string = join(
  GLOBAL_CACHE_DIR,
  'workflows.json',
);

/** Cached user directory. */
export const GLOBAL_USERS_PATH: string = join(GLOBAL_CACHE_DIR, 'users.json');

/** Persistent runtime state. */
export const GLOBAL_STATE_PATH: string = join(GLOBAL_CONFIG_DIR, 'state.json');

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
  await mkdir(GLOBAL_CONFIG_DIR, { recursive: true });
  await mkdir(GLOBAL_CACHE_DIR, { recursive: true });
  await mkdir(GLOBAL_COMMENT_TEMPLATES_DIR, { recursive: true });
  await mkdir(GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR, { recursive: true });
  await mkdir(GLOBAL_TASK_TEMPLATES_DIR, { recursive: true });
}
