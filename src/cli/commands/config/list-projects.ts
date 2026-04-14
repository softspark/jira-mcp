/**
 * `jira-mcp config list-projects` command handler.
 *
 * Displays all configured projects in a tabular format,
 * highlighting which one is the default.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { loadJsonFile } from '../../../utils/fs.js';
import { info, table, error } from '../../output.js';

/** Shape of the raw config.json file (pre-validation). */
interface RawConfigFile {
  readonly projects: Record<string, { readonly url: string; readonly language?: string }>;
  readonly default_project: string;
  readonly default_language?: string;
}

/** Row data returned for external consumption (testing). */
export interface ProjectRow {
  readonly key: string;
  readonly url: string;
  readonly isDefault: boolean;
  readonly language: string;
  readonly languageSource: 'project' | 'default';
}

/**
 * List all configured projects.
 *
 * @param configDir - Root config directory containing config.json.
 * @returns Array of project rows for display.
 */
export async function handleListProjects(
  configDir: string,
): Promise<readonly ProjectRow[]> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  const globalLang = config.default_language ?? 'pl';

  return Object.entries(config.projects).map(([key, project]) => ({
    key,
    url: project.url,
    isDefault: key === config.default_project,
    language: project.language ?? globalLang,
    languageSource: project.language ? 'project' as const : 'default' as const,
  }));
}

/** Register the `config list-projects` subcommand. */
export function registerListProjectsCommand(parent: Command): void {
  parent
    .command('list-projects')
    .description('Show all configured projects')
    .action(async () => {
      try {
        const rows = await handleListProjects(GLOBAL_CONFIG_DIR);

        if (rows.length === 0) {
          info('No projects configured. Run: jira-mcp config add-project <key> <url>');
          return;
        }

        const tableRows = rows.map((r) => [
          r.key,
          r.url,
          r.isDefault ? '*' : '',
          r.languageSource === 'project' ? r.language : `${r.language} (default)`,
        ]);

        table(['KEY', 'URL', 'DEFAULT', 'LANGUAGE'], tableRows);
        info(`\n${String(rows.length)} project(s) configured.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
