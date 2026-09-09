// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * `confluence-mcp space ...` command group.
 *
 * Manages the `spaces` section of the shared config.json. Credentials are
 * not handled here: one Atlassian site serves Jira and Confluence with the
 * same token, so `jira-mcp config set-credentials` remains the single place
 * that writes credentials.json.
 *
 * Every writer spreads the loaded config rather than rebuilding it, so the
 * Jira `projects` section survives a Confluence-side edit.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import {
  BODY_FORMATS,
  DEFAULT_BODY_FORMAT,
  GLOBAL_CONFIG_DIR,
  SUPPORTED_LANGUAGES,
  loadJsonFile,
  saveJsonFile,
} from '@softspark/atlassian-mcp-core';
import { error, info, table } from '@softspark/atlassian-mcp-core';

/** Shape of the raw config.json file (pre-validation). */
interface RawConfigFile {
  readonly projects?: Record<string, { readonly url: string }>;
  readonly default_project?: string;
  readonly default_language?: string;
  readonly spaces?: Record<
    string,
    {
      readonly url: string;
      readonly language?: string;
      readonly format?: string;
    }
  >;
  readonly default_space?: string;
  readonly default_format?: string;
}

/** Regex for valid space keys: uppercase letters and digits. */
const SPACE_KEY_PATTERN = /^[A-Z][A-Z0-9]*$/;

function assertValidKey(key: string): void {
  if (!SPACE_KEY_PATTERN.test(key)) {
    throw new Error(
      `Invalid space key "${key}": must be uppercase alphanumeric starting with a letter (e.g. DOCS, KB1).`,
    );
  }
}

function assertValidUrl(url: string): void {
  if (!url.startsWith('https://')) {
    throw new Error(`Invalid URL "${url}": must start with https://.`);
  }
}

function assertValidLanguage(lang: string): void {
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    throw new Error(
      `Invalid language "${lang}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.`,
    );
  }
}

function assertValidFormat(format: string): void {
  if (!(BODY_FORMATS as readonly string[]).includes(format)) {
    throw new Error(
      `Invalid format "${format}". Supported: ${BODY_FORMATS.join(', ')}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Add a space mapping to config.json.
 *
 * The first space added also becomes the default, so a single-space setup
 * never needs a second command.
 */
export async function handleAddSpace(
  configDir: string,
  key: string,
  url: string,
): Promise<void> {
  assertValidKey(key);
  assertValidUrl(url);

  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  const spaces = { ...(config.spaces ?? {}), [key]: { url } };
  const updated: RawConfigFile = {
    ...config,
    spaces,
    default_space: config.default_space ?? key,
  };

  await saveJsonFile(configPath, updated);
}

/** Remove a space mapping. Reports whether the default was cleared. */
export async function handleRemoveSpace(
  configDir: string,
  key: string,
): Promise<{ readonly defaultCleared: boolean }> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);
  const spaces = config.spaces ?? {};

  if (!(key in spaces)) {
    throw new Error(`Space "${key}" is not configured.`);
  }

  const remaining: Record<
    string,
    { readonly url: string; readonly language?: string }
  > = {};
  for (const [k, v] of Object.entries(spaces)) {
    if (k !== key) {
      remaining[k] = v;
    }
  }

  const defaultCleared = config.default_space === key;
  // Promote the only survivor rather than leaving a dangling default, which
  // would fail config validation on the next load.
  const remainingKeys = Object.keys(remaining);
  const nextDefault = defaultCleared ? remainingKeys[0] : config.default_space;

  const updated: RawConfigFile = {
    ...config,
    spaces: remaining,
    ...(nextDefault !== undefined
      ? { default_space: nextDefault }
      : { default_space: undefined }),
  };

  // Drop the key entirely when nothing is left, so the file has no null.
  if (nextDefault === undefined) {
    delete (updated as { default_space?: string }).default_space;
  }

  await saveJsonFile(configPath, updated);

  return { defaultCleared };
}

/** Set the default space used when a tool call omits `space_key`. */
export async function handleSetDefaultSpace(
  configDir: string,
  key: string,
): Promise<void> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  if (!(key in (config.spaces ?? {}))) {
    throw new Error(
      `Space "${key}" is not configured. Add it first with: confluence-mcp space add ${key} <url>`,
    );
  }

  await saveJsonFile(configPath, { ...config, default_space: key });
}

/** Set the content language for one space. */
export async function handleSetSpaceLanguage(
  configDir: string,
  key: string,
  language: string,
): Promise<void> {
  assertValidLanguage(language);

  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);
  const space = config.spaces?.[key];

  if (!space) {
    throw new Error(
      `Space "${key}" is not configured. Add it first with: confluence-mcp space add ${key} <url>`,
    );
  }

  await saveJsonFile(configPath, {
    ...config,
    spaces: { ...config.spaces, [key]: { ...space, language } },
  });
}

/**
 * Set the body format for one space.
 *
 * `storage` declares that the space's pages are Confluence XHTML: reads return
 * that XHTML and markdown writes are refused, because converting would delete
 * every macro and page link the space depends on. Set this on any space whose
 * pages were authored outside this tool.
 */
export async function handleSetSpaceFormat(
  configDir: string,
  key: string,
  format: string,
): Promise<void> {
  assertValidFormat(format);

  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);
  const space = config.spaces?.[key];

  if (!space) {
    throw new Error(
      `Space "${key}" is not configured. Add it first with: confluence-mcp space add ${key} <url>`,
    );
  }

  await saveJsonFile(configPath, {
    ...config,
    spaces: { ...config.spaces, [key]: { ...space, format } },
  });
}

/** Rows for `space list`: key, URL, language, format, and the default marker. */
export async function handleListSpaces(
  configDir: string,
): Promise<readonly (readonly string[])[]> {
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);
  const globalLang = config.default_language ?? 'pl';
  const globalFormat = config.default_format ?? DEFAULT_BODY_FORMAT;

  return Object.entries(config.spaces ?? {}).map(([key, space]) => [
    key,
    space.url,
    space.language ?? `${globalLang} (inherited)`,
    space.format ?? `${globalFormat} (inherited)`,
    config.default_space === key ? 'yes' : '',
  ]);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register the `space` subcommand group. */
export function registerSpaceCommands(program: Command): void {
  const space = program
    .command('space')
    .description('Manage Confluence space mappings in config.json');

  space
    .command('add')
    .description('Add a Confluence space mapping')
    .argument('<key>', 'Uppercase space key (e.g. DOCS)')
    .argument('<url>', 'Confluence site URL (https://your-site.atlassian.net)')
    .action(async (key: string, url: string) => {
      try {
        await handleAddSpace(GLOBAL_CONFIG_DIR, key, url);
        info(`Added space ${key} -> ${url}`);
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  space
    .command('remove')
    .description('Remove a Confluence space mapping')
    .argument('<key>', 'Space key to remove')
    .action(async (key: string) => {
      try {
        const { defaultCleared } = await handleRemoveSpace(
          GLOBAL_CONFIG_DIR,
          key,
        );
        info(`Removed space ${key}`);
        if (defaultCleared) {
          info('The default space was reassigned. Check: confluence-mcp space list');
        }
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  space
    .command('list')
    .description('List configured Confluence spaces')
    .action(async () => {
      try {
        const rows = await handleListSpaces(GLOBAL_CONFIG_DIR);
        if (rows.length === 0) {
          info('No spaces configured. Add one with: confluence-mcp space add <KEY> <url>');
          return;
        }
        table(['KEY', 'URL', 'LANGUAGE', 'FORMAT', 'DEFAULT'], rows);
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  space
    .command('set-default')
    .description('Set the space used when a tool call omits space_key')
    .argument('<key>', 'Space key')
    .action(async (key: string) => {
      try {
        await handleSetDefaultSpace(GLOBAL_CONFIG_DIR, key);
        info(`Default space set to ${key}`);
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  space
    .command('set-format')
    .description(
      'Set how page bodies are exchanged with a space (markdown or storage)',
    )
    .argument('<key>', 'Space key')
    .argument('<format>', `Body format (${BODY_FORMATS.join(', ')})`)
    .action(async (key: string, format: string) => {
      try {
        await handleSetSpaceFormat(GLOBAL_CONFIG_DIR, key, format);
        info(`Body format for ${key} set to ${format}`);
        if (format === 'storage') {
          info(
            'Pages in this space are now read and written as Confluence XHTML. Markdown writes will be refused.',
          );
        }
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  space
    .command('set-language')
    .description('Set the content language for a space')
    .argument('<key>', 'Space key')
    .argument('<lang>', `Language code (${SUPPORTED_LANGUAGES.join(', ')})`)
    .action(async (key: string, lang: string) => {
      try {
        await handleSetSpaceLanguage(GLOBAL_CONFIG_DIR, key, lang);
        info(`Language for ${key} set to ${lang}`);
      } catch (err: unknown) {
        error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
