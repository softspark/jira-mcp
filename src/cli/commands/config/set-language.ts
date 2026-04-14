/**
 * `jira-mcp config set-language <lang>` command handler.
 *
 * Sets the default language for task content (summaries, descriptions).
 * Per-project overrides can be set directly in config.json.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { SUPPORTED_LANGUAGES, LanguageCodeSchema } from '../../../config/schema.js';
import { loadJsonFile, saveJsonFile } from '../../../utils/fs.js';
import { info, error } from '../../output.js';

/** Raw config.json shape for language operations. */
interface RawConfigFile {
  readonly projects: Record<string, { readonly url: string; readonly language?: string }>;
  readonly default_language?: string;
}

function validateLanguage(language: string): string {
  const result = LanguageCodeSchema.safeParse(language);
  if (!result.success) {
    throw new Error(
      `Invalid language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
    );
  }
  return result.data;
}

/**
 * Set the default language.
 *
 * @param configDir - Root config directory containing config.json.
 * @param language - Language code to set as default.
 */
export async function handleSetLanguage(
  configDir: string,
  language: string,
): Promise<void> {
  const lang = validateLanguage(language);
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<Record<string, unknown>>(configPath);

  await saveJsonFile(configPath, { ...config, default_language: lang });
}

/**
 * Set the language for a specific project.
 *
 * @param configDir - Root config directory containing config.json.
 * @param projectKey - Project key (must already be configured).
 * @param language - Language code to set.
 */
export async function handleSetProjectLanguage(
  configDir: string,
  projectKey: string,
  language: string,
): Promise<void> {
  const lang = validateLanguage(language);
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  if (!(projectKey in config.projects)) {
    throw new Error(
      `Project "${projectKey}" is not configured. Add it first with: jira-mcp config add-project ${projectKey} <url>`,
    );
  }

  const project = config.projects[projectKey];
  if (!project) {
    throw new Error(`Project "${projectKey}" not found.`);
  }

  const updatedConfig = {
    ...config,
    projects: {
      ...config.projects,
      [projectKey]: { ...project, language: lang },
    },
  };

  await saveJsonFile(configPath, updatedConfig);
}

/** Register the `config set-language` subcommand. */
export function registerSetLanguageCommand(parent: Command): void {
  parent
    .command('set-language')
    .description(`Set the default language (${SUPPORTED_LANGUAGES.join(', ')})`)
    .argument('<lang>', 'Language code')
    .action(async (lang: string) => {
      try {
        await handleSetLanguage(GLOBAL_CONFIG_DIR, lang);
        info(`Default language set to "${lang}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });

  parent
    .command('set-project-language')
    .description(`Set language for a specific project (${SUPPORTED_LANGUAGES.join(', ')})`)
    .argument('<key>', 'Project key')
    .argument('<lang>', 'Language code')
    .action(async (key: string, lang: string) => {
      try {
        await handleSetProjectLanguage(GLOBAL_CONFIG_DIR, key, lang);
        info(`Language for project "${key}" set to "${lang}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
