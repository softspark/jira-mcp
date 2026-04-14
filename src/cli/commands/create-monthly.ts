/**
 * `jira-mcp create-monthly` command handler.
 *
 * Scans the global templates directory for `monthly_admin.json` files
 * under per-project subdirectories and executes them as bulk task
 * creation operations.
 *
 * Directory structure:
 *   ~/.softspark/jira-mcp/templates/tasks/
 *     biel/monthly_admin.json
 *     e8a/monthly_admin.json
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
import { info, warn, error } from '../output.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A discovered monthly config file with its project key. */
export interface DiscoveredConfig {
  readonly projectKey: string;
  readonly configPath: string;
}

/** Result of processing a single monthly config. */
export interface MonthlyConfigResult {
  readonly projectKey: string;
  readonly configPath: string;
  readonly result?: BulkResult;
  readonly error?: string;
}

/** Aggregate result of the create-monthly command. */
export interface CreateMonthlyResult {
  readonly configs: readonly MonthlyConfigResult[];
  readonly totalProcessed: number;
  readonly totalFailed: number;
}

/** Injectable dependencies for testability. */
export interface CreateMonthlyDeps {
  readonly templatesDir?: string;
  readonly loadConfig?: () => Promise<JiraConfig>;
  readonly createPool?: (config: JiraConfig) => InstancePool;
  readonly createBulkCreator?: (
    connector: JiraConnector,
    projectKey: string,
  ) => BulkTaskCreator;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Scan the templates directory for monthly_admin.json files.
 *
 * @param project      - Optional project key filter (case-insensitive).
 * @param templatesDir - Override for the global templates directory.
 * @returns Sorted list of discovered configs.
 */
export async function discoverMonthlyConfigs(
  project?: string,
  templatesDir?: string,
): Promise<readonly DiscoveredConfig[]> {
  const { readdir, stat, access } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const tasksDir = templatesDir ?? GLOBAL_TASK_TEMPLATES_DIR;
  const results: DiscoveredConfig[] = [];

  let dirNames: string[];
  try {
    const names = await readdir(tasksDir);
    const checks = await Promise.all(
      names.map(async (name) => {
        const s = await stat(join(tasksDir, name));
        return { name, isDir: s.isDirectory() };
      }),
    );
    dirNames = checks.filter((c) => c.isDir).map((c) => c.name);
  } catch {
    // Directory does not exist or is unreadable
    return [];
  }

  for (const dirName of dirNames) {
    // Apply project filter (case-insensitive)
    if (project && dirName.toUpperCase() !== project.toUpperCase()) {
      continue;
    }

    const configPath = join(tasksDir, dirName, 'monthly_admin.json');

    try {
      await access(configPath);
      results.push({
        projectKey: dirName.toUpperCase(),
        configPath,
      });
    } catch {
      // No monthly_admin.json in this directory -- skip
    }
  }

  // Sort by project key for deterministic output
  results.sort((a, b) => a.projectKey.localeCompare(b.projectKey));
  return results;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Execute the `create-monthly` command.
 *
 * @param options - CLI options (--execute, --project flags).
 * @param deps    - Injectable dependencies for testing.
 * @returns Aggregate result across all discovered configs.
 */
export async function handleCreateMonthly(
  options: { readonly execute?: boolean; readonly project?: string },
  deps?: CreateMonthlyDeps,
): Promise<CreateMonthlyResult> {
  const { readFile } = await import('node:fs/promises');

  // Step 1 -- discover configs
  const configs = await discoverMonthlyConfigs(
    options.project,
    deps?.templatesDir,
  );

  if (configs.length === 0) {
    return { configs: [], totalProcessed: 0, totalFailed: 0 };
  }

  // Step 2 -- load Jira config once
  const loadFn = deps?.loadConfig ?? loadConfig;
  const jiraConfig = await loadFn();

  const createPoolFn =
    deps?.createPool ?? ((c: JiraConfig) => new InstancePool(c));
  const pool = createPoolFn(jiraConfig);

  // Step 3 -- process each config
  const results: MonthlyConfigResult[] = [];
  let totalFailed = 0;

  for (const discovered of configs) {
    try {
      // Read and parse
      const raw = await readFile(discovered.configPath, 'utf-8');
      const json: unknown = JSON.parse(raw);

      // Validate
      const parseResult = BulkConfigSchema.safeParse(json);
      if (!parseResult.success) {
        results.push({
          projectKey: discovered.projectKey,
          configPath: discovered.configPath,
          error: `Invalid config: ${parseResult.error.message}`,
        });
        totalFailed++;
        continue;
      }

      // Replace placeholders
      const config = replacePlaceholders(parseResult.data);

      // Resolve language: explicit in JSON > project config > global default
      const rawJson = json as Record<string, unknown>;
      const rawOptions = (rawJson['options'] ?? {}) as Record<string, unknown>;
      const hasExplicitLanguage = 'language' in rawOptions;

      const projectKey = config.epic_key.split('-')[0] ?? '';
      const projectLanguage = jiraConfig.projects[projectKey]?.language
        ?? jiraConfig.default_language;

      // Set dry_run and resolved language
      const bulkConfig = {
        ...config,
        options: {
          ...config.options,
          dry_run: options.execute !== true,
          ...(!hasExplicitLanguage && projectLanguage ? { language: projectLanguage } : {}),
        },
      };
      if (!projectKey) {
        results.push({
          projectKey: discovered.projectKey,
          configPath: discovered.configPath,
          error: `Invalid epic_key format: '${bulkConfig.epic_key}'`,
        });
        totalFailed++;
        continue;
      }

      // Get connector and create tasks
      const connector = pool.getConnector(projectKey);
      const createCreatorFn =
        deps?.createBulkCreator ??
        ((c: JiraConnector, pk: string) => new BulkTaskCreator(c, pk));
      const creator = createCreatorFn(connector, projectKey);
      const result = await creator.execute(bulkConfig);

      results.push({
        projectKey: discovered.projectKey,
        configPath: discovered.configPath,
        result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        projectKey: discovered.projectKey,
        configPath: discovered.configPath,
        error: message,
      });
      totalFailed++;
    }
  }

  return {
    configs: results,
    totalProcessed: configs.length,
    totalFailed,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format the aggregate monthly result for CLI output.
 *
 * @param result - Aggregate monthly result.
 * @returns Multi-line human-readable string.
 */
function formatMonthlyResult(result: CreateMonthlyResult): string {
  const lines: string[] = [];

  if (result.totalProcessed === 0) {
    lines.push('No monthly_admin.json configs found.');
    return lines.join('\n');
  }

  lines.push(`Processing ${String(result.totalProcessed)} monthly config(s)...`);
  lines.push('');

  for (const config of result.configs) {
    lines.push(`--- ${config.projectKey} ---`);

    if (config.error) {
      lines.push(`  Error: ${config.error}`);
    } else if (config.result) {
      lines.push(formatBulkResult(config.result));
    }

    lines.push('');
  }

  lines.push(
    `Completed: ${String(result.totalProcessed - result.totalFailed)} succeeded, ${String(result.totalFailed)} failed`,
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/** Register the `create-monthly` subcommand on the given parent command. */
export function registerCreateMonthlyCommand(parent: Command): void {
  parent
    .command('create-monthly')
    .description(
      'Run all monthly_admin.json configs from templates (dry-run by default)',
    )
    .option('--execute', 'Execute for real (default is dry-run)')
    .option('--project <key>', 'Filter to a specific project key')
    .action(
      async (opts: { execute?: boolean; project?: string }) => {
        try {
          const result = await handleCreateMonthly(opts);

          if (result.totalProcessed === 0) {
            warn('No monthly_admin.json configs found in templates directory.');
            return;
          }

          info(formatMonthlyResult(result));
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : String(err);
          error(message);
          process.exitCode = 1;
        }
      },
    );
}
