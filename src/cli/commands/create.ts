/**
 * `jira-mcp create <config-path>` command handler.
 *
 * Reads a bulk task configuration JSON file, validates it, replaces
 * placeholders, and executes (or previews) the bulk creation via
 * {@link BulkTaskCreator}.
 *
 * Config path resolution order:
 *  1. Exact path (if ends with `.json` and exists)
 *  2. Input with `.json` appended (relative to cwd)
 *  3. Global templates dir (`~/.softspark/jira-mcp/templates/tasks/`)
 *
 * @module
 */

import type { Command } from 'commander';

import type { JiraConfig } from '../../config/types.js';
import type { JiraConnector } from '../../connector/jira-connector.js';
import type { BulkResult } from '../../bulk/types.js';
import { BulkConfigSchema } from '../../bulk/schema.js';
import { replacePlaceholders } from '../../bulk/placeholder.js';
import { BulkTaskCreator } from '../../bulk/bulk-task-creator.js';
import { formatBulkResult } from '../../bulk/result-formatter.js';
import { loadConfig } from '../../config/loader.js';
import { InstancePool } from '../../connector/instance-pool.js';
import { GLOBAL_TASK_TEMPLATES_DIR } from '../../config/paths.js';
import { info, error } from '../output.js';

// ---------------------------------------------------------------------------
// Dependency injection interface
// ---------------------------------------------------------------------------

/** Injectable dependencies for testability. */
export interface CreateDeps {
  readonly templatesDir?: string;
  readonly loadConfig?: () => Promise<JiraConfig>;
  readonly createPool?: (config: JiraConfig) => InstancePool;
  readonly createBulkCreator?: (
    connector: JiraConnector,
    projectKey: string,
  ) => BulkTaskCreator;
}

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a user-provided config reference to an absolute file path.
 *
 * Tries the input as-is, with `.json` appended, and finally under the
 * global task templates directory.
 *
 * @param input        - User-provided path or template name.
 * @param templatesDir - Override for the global templates directory.
 * @returns Absolute path to the resolved config file.
 * @throws {Error} When the config file cannot be found.
 */
export async function resolveConfigPath(
  input: string,
  templatesDir?: string,
): Promise<string> {
  const { resolve, join } = await import('node:path');
  const { access } = await import('node:fs/promises');

  const globalDir = templatesDir ?? GLOBAL_TASK_TEMPLATES_DIR;

  // Try as-is (absolute or relative with .json)
  if (input.endsWith('.json')) {
    const abs = resolve(input);
    try {
      await access(abs);
      return abs;
    } catch {
      // not found at exact path
    }
  }

  // Try with .json appended
  const withJson = resolve(input.endsWith('.json') ? input : `${input}.json`);
  try {
    await access(withJson);
    return withJson;
  } catch {
    // not found with .json suffix
  }

  // Try in global templates dir
  const globalPath = join(
    globalDir,
    input.endsWith('.json') ? input : `${input}.json`,
  );
  try {
    await access(globalPath);
    return globalPath;
  } catch {
    // not found in templates
  }

  throw new Error(`Config not found: tried ${withJson} and ${globalPath}`);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `create` command.
 *
 * @param configPath - User-supplied config path or template name.
 * @param options    - CLI options (--execute flag).
 * @param deps       - Injectable dependencies for testing.
 * @returns The bulk operation result.
 */
export async function handleCreate(
  configPath: string,
  options: { readonly execute?: boolean },
  deps?: CreateDeps,
): Promise<BulkResult> {
  const { readFile } = await import('node:fs/promises');

  // Step 1 -- resolve config path
  const resolvedPath = await resolveConfigPath(
    configPath,
    deps?.templatesDir,
  );

  // Step 2 -- read JSON file
  const raw = await readFile(resolvedPath, 'utf-8');
  const json: unknown = JSON.parse(raw);

  // Step 3 -- validate with schema
  const parseResult = BulkConfigSchema.safeParse(json);
  if (!parseResult.success) {
    throw new Error(
      `Invalid config: ${parseResult.error.message}`,
    );
  }

  // Step 4 -- replace placeholders
  const config = replacePlaceholders(parseResult.data);

  // Step 5 -- load Jira config (before bulkConfig to resolve language)
  const loadFn = deps?.loadConfig ?? loadConfig;
  const jiraConfig = await loadFn();

  // Step 6 -- set dry_run and resolve language from project config if not explicit
  const rawJson = json as Record<string, unknown>;
  const rawOptions = (rawJson['options'] ?? {}) as Record<string, unknown>;
  const hasExplicitLanguage = 'language' in rawOptions;

  const projectKey = config.epic_key.split('-')[0] ?? '';
  const projectLanguage = jiraConfig.projects[projectKey]?.language
    ?? jiraConfig.default_language;

  const bulkConfig = {
    ...config,
    options: {
      ...config.options,
      dry_run: options.execute !== true,
      ...(!hasExplicitLanguage && projectLanguage ? { language: projectLanguage } : {}),
    },
  };

  // Step 7 -- create instance pool
  const createPoolFn = deps?.createPool ?? ((c: JiraConfig) => new InstancePool(c));
  const pool = createPoolFn(jiraConfig);

  // Step 8 -- validate project key
  if (!projectKey) {
    throw new Error(
      `Invalid epic_key format: '${bulkConfig.epic_key}'. Expected 'PROJECT-NUMBER'.`,
    );
  }

  // Step 9 -- get connector for project
  const connector = pool.getConnector(projectKey);

  // Step 10 -- create BulkTaskCreator and execute
  const createCreatorFn =
    deps?.createBulkCreator ??
    ((c: JiraConnector, pk: string) => new BulkTaskCreator(c, pk));
  const creator = createCreatorFn(connector, projectKey);
  const result = await creator.execute(bulkConfig);

  return result;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/** Register the `create` subcommand on the given parent command. */
export function registerCreateCommand(parent: Command): void {
  parent
    .command('create <config-path>')
    .description(
      'Create tasks from a bulk config file (dry-run by default)',
    )
    .option('--execute', 'Execute for real (default is dry-run)')
    .action(async (configPath: string, opts: { execute?: boolean }) => {
      try {
        const result = await handleCreate(configPath, opts);
        info(formatBulkResult(result));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
