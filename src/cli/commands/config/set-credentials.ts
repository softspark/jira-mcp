/**
 * `jira-mcp config set-credentials <email> <token>` command handler.
 *
 * Writes API credentials to the global credentials.json file.
 * Always overwrites existing credentials (this is intentional).
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import { GLOBAL_CONFIG_DIR } from '../../../config/paths.js';
import { writeSecureFile } from '../../../utils/fs.js';
import { info, error } from '../../output.js';

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
 * Write API credentials to credentials.json.
 *
 * @param configDir - Root config directory.
 * @param email - Jira account email.
 * @param token - Jira API token.
 */
export async function handleSetCredentials(
  configDir: string,
  email: string,
  token: string,
): Promise<void> {
  const credentialsPath = join(configDir, 'credentials.json');
  const content = JSON.stringify(
    { username: email, api_token: token },
    null,
    2,
  );
  await writeSecureFile(credentialsPath, content);
}

/** Register the `config set-credentials` subcommand. */
export function registerSetCredentialsCommand(parent: Command): void {
  parent
    .command('set-credentials')
    .description('Set Jira API credentials. Token is read from JIRA_API_TOKEN env var or --token option (avoid passing as positional arg — visible in process list).')
    .argument('<email>', 'Jira account email')
    .option('--token <token>', 'Jira API token (prefer JIRA_API_TOKEN env var)')
    .action(async (email: string, options: { token?: string }) => {
      try {
        const token = options.token ?? process.env['JIRA_API_TOKEN'];
        if (!token) {
          error('API token required. Provide via --token flag or JIRA_API_TOKEN env var.');
          process.exitCode = 1;
          return;
        }
        await handleSetCredentials(GLOBAL_CONFIG_DIR, email, token);
        info(`Credentials saved for ${email} (token: ${maskToken(token)})`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
