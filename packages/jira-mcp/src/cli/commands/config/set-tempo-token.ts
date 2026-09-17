// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * `jira-mcp config set-tempo-token --token <token> [--url <jira-url>]` command handler.
 *
 * Stores the Tempo API token next to the Jira credential for the same site.
 * Without `--url` it lands on the default credential; with `--url` on that
 * instance's entry, which is created from the default when it does not exist
 * yet, so a single-site install never has to spell its Jira token twice.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../paths.js';
import { writeSecureFile } from '@softspark/atlassian-mcp-core';
import { info, error } from '@softspark/atlassian-mcp-core';

import type { CredentialsFileB } from './set-credentials.js';
import { maskToken, readExistingCredentials } from './set-credentials.js';

/**
 * Write a Tempo token into credentials.json (Format B).
 *
 * @param configDir - Root config directory.
 * @param token - Tempo API token.
 * @param url - Optional Jira instance URL. When provided, sets the token on
 *              that instance's credential. When omitted, on the default.
 * @throws {Error} When no credentials.json exists yet: a Tempo token without
 *   a Jira credential could never be used, since the site is resolved
 *   through the Jira project map.
 */
export async function handleSetTempoToken(
  configDir: string,
  token: string,
  url?: string,
): Promise<void> {
  const credentialsPath = join(configDir, 'credentials.json');
  const existing = await readExistingCredentials(credentialsPath);

  if (!existing) {
    throw new Error(
      'No Jira credentials found. Run `jira-mcp config set-credentials <email> --token <token>` first.',
    );
  }

  let result: CredentialsFileB;

  if (url) {
    const base = existing.instances?.[url] ?? existing.default;
    result = {
      default: existing.default,
      instances: {
        ...existing.instances,
        [url]: { ...base, tempo_token: token },
      },
    };
  } else {
    result = {
      default: { ...existing.default, tempo_token: token },
      instances: existing.instances ?? {},
    };
  }

  // Omit empty instances object for cleaner output
  const output =
    Object.keys(result.instances ?? {}).length > 0
      ? result
      : { default: result.default };

  await writeSecureFile(credentialsPath, JSON.stringify(output, null, 2));
}

/** Register the `config set-tempo-token` subcommand. */
export function registerSetTempoTokenCommand(parent: Command): void {
  parent
    .command('set-tempo-token')
    .description(
      'Set the Tempo API token for the default site, or for one Jira instance with --url. Token is read from TEMPO_API_TOKEN env var or --token option.',
    )
    .option('--token <token>', 'Tempo API token (prefer TEMPO_API_TOKEN env var)')
    .option(
      '--url <url>',
      'Jira instance URL whose credential gets the token (e.g. https://team.atlassian.net)',
    )
    .action(async (options: { token?: string; url?: string }) => {
      try {
        const token = options.token ?? process.env['TEMPO_API_TOKEN'];
        if (!token) {
          error(
            'Tempo API token required. Provide via --token flag or TEMPO_API_TOKEN env var.',
          );
          process.exitCode = 1;
          return;
        }

        if (options.url) {
          try {
            new URL(options.url);
          } catch {
            error(`Invalid URL: ${options.url}`);
            process.exitCode = 1;
            return;
          }
        }

        await handleSetTempoToken(GLOBAL_CONFIG_DIR, token, options.url);

        const target = options.url ? `instance ${options.url}` : 'default';
        info(`Tempo token saved for ${target} (token: ${maskToken(token)})`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
