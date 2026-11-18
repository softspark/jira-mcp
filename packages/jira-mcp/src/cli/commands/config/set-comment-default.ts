// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * `jira-mcp config set-comment-default <internal|public>` and
 * `jira-mcp config set-project-comment-default <key> <internal|public>`.
 *
 * Set what a comment posted without an explicit `internal` flag becomes in
 * a Jira Service Management project. The project value wins over the global
 * one; neither set means public.
 *
 * @module
 */

import { join } from 'node:path';

import type { Command } from 'commander';

import {
  COMMENT_DEFAULTS,
  CommentDefaultSchema,
  loadJsonFile,
  saveJsonFile,
  info,
  error,
} from '@softspark/atlassian-mcp-core';
import type { CommentDefault } from '@softspark/atlassian-mcp-core';
import { GLOBAL_CONFIG_DIR } from '../../../paths.js';

/** Raw config.json shape; only `projects` is touched, the rest is spread back. */
interface RawConfigFile {
  readonly projects: Record<string, Record<string, unknown>>;
}

function validateCommentDefault(value: string): CommentDefault {
  const result = CommentDefaultSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid comment default "${value}". Supported: ${COMMENT_DEFAULTS.join(', ')}`,
    );
  }
  return result.data;
}

/**
 * Set the global default comment audience, used by every project without
 * its own `default_comment`.
 *
 * @param configDir - Root config directory containing config.json.
 * @param value - `internal` or `public`.
 */
export async function handleSetCommentDefault(
  configDir: string,
  value: string,
): Promise<void> {
  const defaultComment = validateCommentDefault(value);
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<Record<string, unknown>>(configPath);

  await saveJsonFile(configPath, { ...config, default_comment: defaultComment });
}

/**
 * Set the default comment audience for a project.
 *
 * @param configDir - Root config directory containing config.json.
 * @param projectKey - Project key (must already be configured).
 * @param value - `internal` or `public`.
 */
export async function handleSetProjectCommentDefault(
  configDir: string,
  projectKey: string,
  value: string,
): Promise<void> {
  const defaultComment = validateCommentDefault(value);
  const configPath = join(configDir, 'config.json');
  const config = await loadJsonFile<RawConfigFile>(configPath);

  const project = config.projects[projectKey];
  if (!project) {
    throw new Error(
      `Project "${projectKey}" is not configured. Add it first with: jira-mcp config add-project ${projectKey} <url>`,
    );
  }

  await saveJsonFile(configPath, {
    ...config,
    projects: {
      ...config.projects,
      [projectKey]: { ...project, default_comment: defaultComment },
    },
  });
}

/** Register the `config set-comment-default` and `set-project-comment-default` subcommands. */
export function registerSetCommentDefaultCommand(parent: Command): void {
  parent
    .command('set-comment-default')
    .description(
      'Service Management projects: global default for a comment without an explicit internal flag (internal, public)',
    )
    .argument('<value>', COMMENT_DEFAULTS.join(' | '))
    .action(async (value: string) => {
      try {
        await handleSetCommentDefault(GLOBAL_CONFIG_DIR, value);
        info(`Comments now default to "${value}" in projects without their own setting`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });

  parent
    .command('set-project-comment-default')
    .description(
      'Service Management projects: what a comment without an explicit internal flag becomes (internal, public)',
    )
    .argument('<key>', 'Project key')
    .argument('<value>', COMMENT_DEFAULTS.join(' | '))
    .action(async (key: string, value: string) => {
      try {
        await handleSetProjectCommentDefault(GLOBAL_CONFIG_DIR, key, value);
        info(`Comments in project "${key}" now default to "${value}"`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exitCode = 1;
      }
    });
}
