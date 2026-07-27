// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Template management commands.
 *
 * Allows importing user templates from local markdown files and inspecting
 * the currently active merged template catalog.
 *
 * Three template kinds are supported:
 *  - `comment`: markdown comment templates with metadata header.
 *  - `task`: markdown single-task templates with metadata header.
 *  - `bulk`: JSON bulk task configs (e.g. `monthly_admin.json`),
 *    keyed by project under `templates/tasks/<KEY>/monthly_admin.json`.
 */

import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { pathExists } from '../../../utils/fs.js';
import { loadTemplateCatalog } from '../../../templates/catalog.js';
import { validateTemplateFile } from '../../../templates/file-loaders.js';
import { BulkConfigSchema } from '../../../bulk/schema.js';
import { info, error, table } from '../../output.js';

export type TemplateKind = 'comment' | 'task' | 'bulk';

/** Filename used for bulk monthly admin configs inside per-project subdirs. */
const BULK_MONTHLY_FILENAME = 'monthly_admin.json';

/** Project key validation: uppercase letters/digits, must start with a letter. */
const PROJECT_KEY_REGEX = /^[A-Z][A-Z0-9]*$/;

function isTemplateKind(value: string): value is TemplateKind {
  return value === 'comment' || value === 'task' || value === 'bulk';
}

function resolveTemplateDir(configDir: string, kind: TemplateKind): string {
  switch (kind) {
    case 'comment':
      return join(configDir, 'templates', 'comments');
    case 'task':
      return join(configDir, 'templates', 'task-templates');
    case 'bulk':
      return join(configDir, 'templates', 'tasks');
  }
}

function normalizeProjectKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!PROJECT_KEY_REGEX.test(key)) {
    throw new Error(
      `Invalid project key "${raw}". Expected uppercase letters/digits starting with a letter (e.g. "PROJ").`,
    );
  }
  return key;
}

function bulkConfigPath(configDir: string, projectKey: string): string {
  return join(resolveTemplateDir(configDir, 'bulk'), projectKey, BULK_MONTHLY_FILENAME);
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export async function handleAddTemplate(
  configDir: string,
  kind: Exclude<TemplateKind, 'bulk'>,
  sourceFile: string,
): Promise<{ readonly id: string; readonly destination: string }> {
  const validated = await validateTemplateFile(sourceFile, kind);
  const raw = await readFile(sourceFile, 'utf-8');
  const targetDir = resolveTemplateDir(configDir, kind);

  await mkdir(targetDir, { recursive: true });

  const destination = join(targetDir, `${validated.id}.md`);
  await writeFile(destination, raw, 'utf-8');

  return { id: validated.id, destination };
}

/**
 * Install a bulk task config (e.g. monthly_admin.json) under
 * `templates/tasks/<projectKey>/monthly_admin.json`.
 *
 * Validates the JSON against {@link BulkConfigSchema} before writing.
 */
export async function handleAddBulkTemplate(
  configDir: string,
  sourceFile: string,
  projectKey: string,
): Promise<{ readonly id: string; readonly destination: string }> {
  const key = normalizeProjectKey(projectKey);

  const raw = await readFile(sourceFile, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${sourceFile}: ${message}`, { cause: err });
  }

  const result = BulkConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid bulk config in ${sourceFile}: ${result.error.message}`,
    );
  }

  const epicProject = result.data.epic_key.split('-')[0];
  if (epicProject && epicProject !== key) {
    info(
      `Warning: epic_key "${result.data.epic_key}" project (${epicProject}) does not match --project ${key}.`,
    );
  }

  const destination = bulkConfigPath(configDir, key);
  await mkdir(join(resolveTemplateDir(configDir, 'bulk'), key), { recursive: true });
  await writeFile(destination, raw, 'utf-8');

  return { id: key, destination };
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export async function handleRemoveTemplate(
  configDir: string,
  kind: TemplateKind,
  id: string,
): Promise<void> {
  if (kind === 'bulk') {
    const key = normalizeProjectKey(id);
    const targetPath = bulkConfigPath(configDir, key);
    if (!(await pathExists(targetPath))) {
      throw new Error(
        `Bulk template for project "${key}" not found at ${targetPath}`,
      );
    }
    await unlink(targetPath);

    // Best-effort cleanup of empty project directory
    const projectDir = join(resolveTemplateDir(configDir, 'bulk'), key);
    try {
      const remaining = await readdir(projectDir);
      if (remaining.length === 0) {
        await rm(projectDir, { recursive: false });
      }
    } catch {
      // Directory removal is best-effort; ignore failures
    }
    return;
  }

  const targetPath = join(resolveTemplateDir(configDir, kind), `${id}.md`);
  if (!(await pathExists(targetPath))) {
    throw new Error(
      `User template "${id}" (${kind}) not found in ${resolveTemplateDir(configDir, kind)}`,
    );
  }
  await unlink(targetPath);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

interface BulkTemplateRow {
  readonly projectKey: string;
  readonly filePath: string;
}

async function listBulkTemplates(configDir: string): Promise<readonly BulkTemplateRow[]> {
  const bulkRoot = resolveTemplateDir(configDir, 'bulk');
  if (!(await pathExists(bulkRoot))) {
    return [];
  }

  const entries = await readdir(bulkRoot);
  const rows: BulkTemplateRow[] = [];

  for (const name of entries) {
    const subDir = join(bulkRoot, name);
    const subStat = await stat(subDir).catch(() => null);
    if (!subStat?.isDirectory()) {
      continue;
    }

    const candidate = join(subDir, BULK_MONTHLY_FILENAME);
    if (await pathExists(candidate)) {
      rows.push({
        projectKey: name.toUpperCase(),
        filePath: candidate,
      });
    }
  }

  rows.sort((a, b) => a.projectKey.localeCompare(b.projectKey));
  return rows;
}

export async function handleListTemplates(
  configDir: string,
  kind?: TemplateKind,
): Promise<readonly (readonly string[])[]> {
  const rows: Array<readonly string[]> = [];

  if (kind === undefined || kind === 'comment' || kind === 'task') {
    const catalog = loadTemplateCatalog({
      commentTemplatesDir: resolveTemplateDir(configDir, 'comment'),
      taskTemplatesDir: resolveTemplateDir(configDir, 'task'),
    });

    if (kind === undefined || kind === 'comment') {
      for (const template of catalog.commentRegistry.listTemplates()) {
        rows.push([
          'comment',
          template.id,
          template.source ?? 'system',
          template.name,
          template.filePath ?? '',
        ]);
      }
    }

    if (kind === undefined || kind === 'task') {
      for (const template of catalog.taskRegistry.listTemplates()) {
        rows.push([
          'task',
          template.id,
          template.source ?? 'system',
          template.name,
          template.filePath ?? '',
        ]);
      }
    }
  }

  if (kind === undefined || kind === 'bulk') {
    for (const bulk of await listBulkTemplates(configDir)) {
      rows.push([
        'bulk',
        bulk.projectKey,
        'user',
        `monthly_admin (${bulk.projectKey})`,
        bulk.filePath,
      ]);
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

export async function handleShowTemplate(
  configDir: string,
  kind: TemplateKind,
  id: string,
): Promise<{ readonly filePath: string; readonly content: string }> {
  if (kind === 'bulk') {
    const key = normalizeProjectKey(id);
    const filePath = bulkConfigPath(configDir, key);
    if (!(await pathExists(filePath))) {
      throw new Error(
        `Bulk template for project "${key}" not found at ${filePath}`,
      );
    }
    return {
      filePath,
      content: await readFile(filePath, 'utf-8'),
    };
  }

  const catalog = loadTemplateCatalog({
    commentTemplatesDir: resolveTemplateDir(configDir, 'comment'),
    taskTemplatesDir: resolveTemplateDir(configDir, 'task'),
  });

  const template =
    kind === 'comment'
      ? catalog.commentRegistry.getTemplate(id)
      : catalog.taskRegistry.getTemplate(id);

  if (!template.filePath) {
    throw new Error(`Template "${id}" (${kind}) has no backing file path.`);
  }

  return {
    filePath: template.filePath,
    content: await readFile(template.filePath, 'utf-8'),
  };
}

// ---------------------------------------------------------------------------
// CLI registration
// ---------------------------------------------------------------------------

export function registerTemplateCommands(parent: Command): void {
  const template = parent
    .command('template')
    .description('Manage file-backed comment, task, and bulk templates');

  template
    .command('add')
    .description(
      'Import a template into the global override directory. ' +
        'For "bulk", pass --project <KEY> and a JSON config file.',
    )
    .argument('<type>', 'Template type: comment, task, or bulk')
    .argument('<source-file>', 'Path to a local template file')
    .option(
      '--project <key>',
      'Project key (required for "bulk" templates)',
    )
    .action(
      async (
        type: string,
        sourceFile: string,
        opts: { project?: string },
      ) => {
        try {
          if (!isTemplateKind(type)) {
            throw new Error('Template type must be one of: comment, task, bulk');
          }

          if (type === 'bulk') {
            if (!opts.project) {
              throw new Error(
                'Bulk templates require --project <KEY>.',
              );
            }
            const result = await handleAddBulkTemplate(
              GLOBAL_CONFIG_DIR,
              sourceFile,
              opts.project,
            );
            info(
              `Installed bulk template for project "${result.id}" -> ${result.destination}`,
            );
            return;
          }

          const result = await handleAddTemplate(
            GLOBAL_CONFIG_DIR,
            type,
            sourceFile,
          );
          info(
            `Installed ${type} template "${result.id}" -> ${result.destination}`,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          error(message);
          process.exitCode = 1;
        }
      },
    );

  template
    .command('list')
    .description('List active templates (system + user overrides)')
    .argument('[type]', 'Optional template type: comment, task, or bulk')
    .action(async (type?: string) => {
      try {
        if (type !== undefined && !isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task, bulk');
        }

        const rows = await handleListTemplates(GLOBAL_CONFIG_DIR, type);
        if (rows.length === 0) {
          info('No templates found.');
          return;
        }

        table(['TYPE', 'ID', 'SOURCE', 'NAME', 'FILE'], rows);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });

  template
    .command('show')
    .description('Show the active template file content')
    .argument('<type>', 'Template type: comment, task, or bulk')
    .argument(
      '<id>',
      'Template id (for bulk this is the project key)',
    )
    .action(async (type: string, id: string) => {
      try {
        if (!isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task, bulk');
        }

        const result = await handleShowTemplate(GLOBAL_CONFIG_DIR, type, id);
        info(`# ${type}:${id}`);
        info(`File: ${result.filePath}`);
        info('');
        info(result.content);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });

  template
    .command('remove')
    .description('Remove a user-installed override template')
    .argument('<type>', 'Template type: comment, task, or bulk')
    .argument(
      '<id>',
      'Template id (for bulk this is the project key)',
    )
    .action(async (type: string, id: string) => {
      try {
        if (!isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task, bulk');
        }

        await handleRemoveTemplate(GLOBAL_CONFIG_DIR, type, id);
        info(`Removed ${type} template override "${id}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
