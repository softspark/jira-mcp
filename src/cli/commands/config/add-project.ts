/**
 * `jira-mcp config add-project <key> <url>` command handler.
 *
 * Adds a project mapping to the global config.json. Sets the project
 * as default if none is configured yet.
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

/** Regex for valid project keys: uppercase letters and digits only. */
const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]*$/;

function isValidProjectKey(key: string): boolean {
  return PROJECT_KEY_PATTERN.test(key);
}

function isValidUrl(url: string): boolean {
  return url.startsWith('https://');
}

/**
 * Add a project mapping to config.json.
 *
 * @param configDir - Root config directory containing config.json.
 * @param key - Uppercase project key (e.g. "PROJ").
 * @param url - Jira instance URL (must start with https://).
 */
export async function handleAddProject(
  configDir: string,
  key: string,
  url: string,
): Promise<void> {
  if (!isValidProjectKey(key)) {
    throw new Error(
      `Invalid project key "${key}": must be uppercase alphanumeric starting with a letter (e.g. PROJ, E8A).`,
    );
  }

  if (!isValidUrl(url)) {
    throw new Error(
      `Invalid URL "${url}": must start with https://.`,
    );
  }

  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  const updatedProjects = { ...config.projects, [key]: { url } };
  const updatedDefault =
    config.default_project === '' ? key : config.default_project;

  const updatedConfig: RawConfigFile = {
    projects: updatedProjects,
    default_project: updatedDefault,
  };

  await saveJsonFile(configPath, updatedConfig);
}

/** Register the `config add-project` subcommand. */
export function registerAddProjectCommand(parent: Command): void {
  parent
    .command('add-project')
    .description('Add a project mapping to config')
    .argument('<key>', 'Uppercase project key (e.g. PROJ)')
    .argument('<url>', 'Jira instance URL (https://...)')
    .action(async (key: string, url: string) => {
      try {
        await handleAddProject(GLOBAL_CONFIG_DIR, key, url);
        info(`Added project ${key} -> ${url}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
