/**
 * `jira-mcp config set-default <key>` command handler.
 *
 * Sets the default project for commands that accept an optional project key.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { loadJsonFile, saveJsonFile } from '../../../utils/fs.js';
import { info, error } from '../../output.js';

/** Shape of the raw config.json file (pre-validation). */
interface RawConfigFile {
  readonly projects: Record<string, { readonly url: string }>;
  readonly default_project: string;
}

/**
 * Set the default project.
 *
 * @param configDir - Root config directory containing config.json.
 * @param key - Project key to set as default (must already be configured).
 */
export async function handleSetDefault(
  configDir: string,
  key: string,
): Promise<void> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  if (!(key in config.projects)) {
    throw new Error(
      `Project "${key}" is not configured. Add it first with: jira-mcp config add-project ${key} <url>`,
    );
  }

  const updatedConfig: RawConfigFile = {
    ...config,
    default_project: key,
  };

  await saveJsonFile(configPath, updatedConfig);
}

/** Register the `config set-default` subcommand. */
export function registerSetDefaultCommand(parent: Command): void {
  parent
    .command('set-default')
    .description('Set the default project')
    .argument('<key>', 'Project key to set as default')
    .action(async (key: string) => {
      try {
        await handleSetDefault(GLOBAL_CONFIG_DIR, key);
        info(`Default project set to ${key}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
