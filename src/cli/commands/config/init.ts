/**
 * `jira-mcp config init` command handler.
 *
 * Creates the global configuration directory tree with skeleton files.
 * Never overwrites existing files -- reports what was created vs skipped.
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { pathExists, writeSecureFile } from '../../../utils/fs.js';
import { info } from '../../output.js';

/** Result of an individual file/directory creation attempt. */
interface InitResult {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly action: 'created' | 'skipped';
}

/** Skeleton content for config.json. */
const SKELETON_CONFIG = JSON.stringify(
  { projects: {}, default_project: '' },
  null,
  2,
);

/** Skeleton content for credentials.json. */
const SKELETON_CREDENTIALS = JSON.stringify(
  { username: '', api_token: '' },
  null,
  2,
);

/** Skeleton content for state.json. */
const SKELETON_STATE = JSON.stringify(
  { version: '0.3.0' },
  null,
  2,
);

async function ensureDirectory(
  dirPath: string,
  results: InitResult[],
): Promise<void> {
  if (await pathExists(dirPath)) {
    results.push({ path: dirPath, kind: 'directory', action: 'skipped' });
  } else {
    await mkdir(dirPath, { recursive: true });
    results.push({ path: dirPath, kind: 'directory', action: 'created' });
  }
}

async function ensureFile(
  filePath: string,
  content: string,
  results: InitResult[],
  secure = false,
): Promise<void> {
  if (await pathExists(filePath)) {
    results.push({ path: filePath, kind: 'file', action: 'skipped' });
  } else if (secure) {
    await writeSecureFile(filePath, content);
    results.push({ path: filePath, kind: 'file', action: 'created' });
  } else {
    await writeFile(filePath, content, 'utf-8');
    results.push({ path: filePath, kind: 'file', action: 'created' });
  }
}

/**
 * Initialize the global config directory with skeleton files.
 *
 * @param configDir - Root directory for configuration (e.g. ~/.softspark/jira-mcp)
 * @returns List of creation results for reporting.
 */
export async function handleInit(configDir: string): Promise<readonly InitResult[]> {
  const results: InitResult[] = [];

  // Directories
  await ensureDirectory(configDir, results);
  await ensureDirectory(join(configDir, 'cache'), results);
  await ensureDirectory(join(configDir, 'templates', 'tasks'), results);

  // Skeleton files
  await ensureFile(join(configDir, 'config.json'), SKELETON_CONFIG, results);
  await ensureFile(
    join(configDir, 'credentials.json'),
    SKELETON_CREDENTIALS,
    results,
    true, // secure: 0o600 permissions
  );
  await ensureFile(join(configDir, 'state.json'), SKELETON_STATE, results);

  return results;
}

/** Register the `config init` subcommand. */
export function registerInitCommand(parent: Command): void {
  parent
    .command('init')
    .description('Create global config directory with skeleton files')
    .action(async () => {
      const results = await handleInit(GLOBAL_CONFIG_DIR);

      for (const result of results) {
        const prefix = result.action === 'created' ? '+' : '=';
        info(`  ${prefix} ${result.kind}: ${result.path}`);
      }

      const created = results.filter((r) => r.action === 'created').length;
      const skipped = results.filter((r) => r.action === 'skipped').length;
      info(`\nDone: ${String(created)} created, ${String(skipped)} skipped.`);
    });
}
