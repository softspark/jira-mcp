/**
 * `jira-mcp config set-credentials <email> --token <token> [--url <jira-url>]` command handler.
 *
 * Reads the existing credentials.json, merges the new credential, and writes
 * back in Format B (`{ default, instances }`). Automatically migrates
 * legacy Format A files on first use.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import {
  CredentialsFileSchema,
  SingleCredentialsSchema,
} from '../../../config/schema.js';
import { loadJsonFile, pathExists, writeSecureFile } from '../../../utils/fs.js';
import { info, error } from '../../output.js';

/** Shape of the Format B credentials file on disk. */
interface CredentialsFileB {
  readonly default: { readonly username: string; readonly api_token: string };
  readonly instances?: Record<string, { readonly username: string; readonly api_token: string }>;
}

/**
 * Mask a sensitive string, showing only the first 4 characters.
 *
 * @param value - The string to mask.
 * @returns Masked string (e.g. "abcd****").
 */
function maskToken(value: string): string {
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 4)}${'*'.repeat(value.length - 4)}`;
}

/**
 * Read existing credentials.json and normalize to Format B.
 *
 * Returns `undefined` when the file does not exist yet.
 */
async function readExistingCredentials(
  credentialsPath: string,
): Promise<CredentialsFileB | undefined> {
  if (!(await pathExists(credentialsPath))) {
    return undefined;
  }

  let raw: unknown;
  try {
    raw = await loadJsonFile(credentialsPath);
  } catch {
    return undefined;
  }

  const parsed = CredentialsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }

  // Format A (legacy): { username, api_token }
  const singleResult = SingleCredentialsSchema.safeParse(raw);
  if (singleResult.success && !('default' in (raw as Record<string, unknown>))) {
    return { default: singleResult.data, instances: {} };
  }

  // Format B: { default, instances? }
  const data = parsed.data as CredentialsFileB;
  return { default: data.default, instances: data.instances ?? {} };
}

/**
 * Write API credentials to credentials.json (Format B).
 *
 * Reads the existing file (if any), merges the new credential into the
 * appropriate slot, and writes back. Automatically migrates Format A → B.
 *
 * @param configDir - Root config directory.
 * @param email - Jira account email.
 * @param token - Jira API token.
 * @param url - Optional Jira instance URL. When provided, sets an instance
 *              override. When omitted, sets the default credential.
 */
export async function handleSetCredentials(
  configDir: string,
  email: string,
  token: string,
  url?: string,
): Promise<void> {
  const credentialsPath = join(configDir, 'credentials.json');
  const credential = { username: email, api_token: token };

  const existing = await readExistingCredentials(credentialsPath);

  let result: CredentialsFileB;

  if (url) {
    // Instance-specific credential
    const base = existing ?? { default: credential, instances: {} };
    result = {
      default: base.default,
      instances: { ...base.instances, [url]: credential },
    };
  } else {
    // Default credential — preserve existing instances
    result = {
      default: credential,
      instances: existing?.instances ?? {},
    };
  }

  // Omit empty instances object for cleaner output
  const output = Object.keys(result.instances ?? {}).length > 0
    ? result
    : { default: result.default };

  await writeSecureFile(credentialsPath, JSON.stringify(output, null, 2));
}

/** Register the `config set-credentials` subcommand. */
export function registerSetCredentialsCommand(parent: Command): void {
  parent
    .command('set-credentials')
    .description('Set Jira API credentials. Use --url to set per-instance credentials. Token is read from JIRA_API_TOKEN env var or --token option.')
    .argument('<email>', 'Jira account email')
    .option('--token <token>', 'Jira API token (prefer JIRA_API_TOKEN env var)')
    .option('--url <url>', 'Jira instance URL for per-instance credentials (e.g. https://team.atlassian.net)')
    .action(async (email: string, options: { token?: string; url?: string }) => {
      try {
        const token = options.token ?? process.env['JIRA_API_TOKEN'];
        if (!token) {
          error('API token required. Provide via --token flag or JIRA_API_TOKEN env var.');
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

        await handleSetCredentials(GLOBAL_CONFIG_DIR, email, token, options.url);

        const target = options.url ? `instance ${options.url}` : 'default';
        info(`Credentials saved for ${email} → ${target} (token: ${maskToken(token)})`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
