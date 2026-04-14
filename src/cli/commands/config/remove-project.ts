/**
 * `jira-mcp config remove-project <key>` command handler.
 *
 * Removes a project mapping from the global config.json.
 * Clears default_project if the removed project was the default.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { loadJsonFile, saveJsonFile } from '../../../utils/fs.js';
import { info, error, warn } from '../../output.js';

/** Shape of the raw config.json file (pre-validation). */
interface RawConfigFile {
  readonly projects: Record<string, { readonly url: string }>;
  readonly default_project: string;
}

/**
 * Remove a project mapping from config.json.
 *
 * @param configDir - Root config directory containing config.json.
 * @param key - Project key to remove.
 * @returns Whether the default_project was cleared as a side effect.
 */
export async function handleRemoveProject(
  configDir: string,
  key: string,
): Promise<{ readonly defaultCleared: boolean }> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  if (!(key in config.projects)) {
    throw new Error(`Project "${key}" is not configured.`);
  }

  const remainingProjects: Record<string, { readonly url: string }> = {};
  for (const [k, v] of Object.entries(config.projects)) {
    if (k !== key) {
      remainingProjects[k] = v;
    }
  }

  const defaultCleared = config.default_project === key;
  const updatedDefault = defaultCleared ? '' : config.default_project;

  const updatedConfig: RawConfigFile = {
    projects: remainingProjects,
    default_project: updatedDefault,
  };

  await saveJsonFile(configPath, updatedConfig);

  return { defaultCleared };
}

/** Register the `config remove-project` subcommand. */
export function registerRemoveProjectCommand(parent: Command): void {
  parent
    .command('remove-project')
    .description('Remove a project mapping from config')
    .argument('<key>', 'Project key to remove')
    .action(async (key: string) => {
      try {
        const { defaultCleared } = await handleRemoveProject(
          GLOBAL_CONFIG_DIR,
          key,
        );
        info(`Removed project ${key}.`);
        if (defaultCleared) {
          warn('Default project was cleared. Set a new default with add-project.');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
