/**
 * Template management commands.
 *
 * Allows importing user templates from local markdown files and inspecting
 * the currently active merged template catalog.
 */

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { pathExists } from '../../../utils/fs.js';
import { loadTemplateCatalog } from '../../../templates/catalog.js';
import { validateTemplateFile } from '../../../templates/file-loaders.js';
import { info, error, table } from '../../output.js';

export type TemplateKind = 'comment' | 'task';

function isTemplateKind(value: string): value is TemplateKind {
  return value === 'comment' || value === 'task';
}

function resolveTemplateDir(configDir: string, kind: TemplateKind): string {
  return join(
    configDir,
    'templates',
    kind === 'comment' ? 'comments' : 'task-templates',
  );
}

export async function handleAddTemplate(
  configDir: string,
  kind: TemplateKind,
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

export async function handleRemoveTemplate(
  configDir: string,
  kind: TemplateKind,
  id: string,
): Promise<void> {
  const targetPath = join(resolveTemplateDir(configDir, kind), `${id}.md`);
  if (!(await pathExists(targetPath))) {
    throw new Error(
      `User template "${id}" (${kind}) not found in ${resolveTemplateDir(configDir, kind)}`,
    );
  }
  await unlink(targetPath);
}

export function handleListTemplates(
  configDir: string,
  kind?: TemplateKind,
): readonly (readonly string[])[] {
  const catalog = loadTemplateCatalog({
    commentTemplatesDir: resolveTemplateDir(configDir, 'comment'),
    taskTemplatesDir: resolveTemplateDir(configDir, 'task'),
  });

  const rows: Array<readonly string[]> = [];

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

  return rows;
}

export async function handleShowTemplate(
  configDir: string,
  kind: TemplateKind,
  id: string,
): Promise<{ readonly filePath: string; readonly content: string }> {
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

export function registerTemplateCommands(parent: Command): void {
  const template = parent
    .command('template')
    .description('Manage file-backed comment and task templates');

  template
    .command('add')
    .description('Import a template file into the global override directory')
    .argument('<type>', 'Template type: comment or task')
    .argument('<source-file>', 'Path to a local markdown template file')
    .action(async (type: string, sourceFile: string) => {
      try {
        if (!isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task');
        }

        const result = await handleAddTemplate(GLOBAL_CONFIG_DIR, type, sourceFile);
        info(
          `Installed ${type} template "${result.id}" -> ${result.destination}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });

  template
    .command('list')
    .description('List active templates (system + user overrides)')
    .argument('[type]', 'Optional template type: comment or task')
    .action((type?: string) => {
      try {
        if (type !== undefined && !isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task');
        }

        const rows = handleListTemplates(GLOBAL_CONFIG_DIR, type);
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
    .argument('<type>', 'Template type: comment or task')
    .argument('<id>', 'Template id')
    .action(async (type: string, id: string) => {
      try {
        if (!isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task');
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
    .argument('<type>', 'Template type: comment or task')
    .argument('<id>', 'Template id')
    .action(async (type: string, id: string) => {
      try {
        if (!isTemplateKind(type)) {
          throw new Error('Template type must be one of: comment, task');
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
