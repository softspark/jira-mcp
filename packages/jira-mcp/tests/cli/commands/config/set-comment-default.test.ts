// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `jira-mcp config set-project-comment-default` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleSetCommentDefault,
  handleSetProjectCommentDefault,
} from '../../../../src/cli/commands/config/set-comment-default';

describe('handleSetCommentDefault', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-test-'));
    await writeFile(
      join(tempDir, 'config.json'),
      JSON.stringify({
        projects: { SD: { url: 'https://sd.atlassian.net' } },
        default_project: 'SD',
        spaces: { DOCS: { url: 'https://sd.atlassian.net' } },
      }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('sets the global default_comment and keeps every other section', async () => {
    await handleSetCommentDefault(tempDir, 'internal');

    const config = JSON.parse(await readFile(join(tempDir, 'config.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(config).toEqual({
      projects: { SD: { url: 'https://sd.atlassian.net' } },
      default_project: 'SD',
      spaces: { DOCS: { url: 'https://sd.atlassian.net' } },
      default_comment: 'internal',
    });
  });

  it('rejects a value other than internal or public', async () => {
    await expect(handleSetCommentDefault(tempDir, 'yes')).rejects.toThrow(
      'Invalid comment default "yes". Supported: internal, public',
    );
  });
});

describe('handleSetProjectCommentDefault', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-test-'));
    await writeFile(
      join(tempDir, 'config.json'),
      JSON.stringify({
        projects: {
          SD: { url: 'https://sd.atlassian.net', language: 'en' },
          DEV: { url: 'https://sd.atlassian.net' },
        },
        default_project: 'SD',
        spaces: { DOCS: { url: 'https://sd.atlassian.net' } },
      }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  async function readConfig(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(tempDir, 'config.json'), 'utf-8')) as Record<
      string,
      unknown
    >;
  }

  it('sets default_comment on the project and keeps its other fields', async () => {
    await handleSetProjectCommentDefault(tempDir, 'SD', 'public');

    const config = await readConfig();
    const projects = config['projects'] as Record<string, Record<string, unknown>>;
    expect(projects['SD']).toEqual({
      url: 'https://sd.atlassian.net',
      language: 'en',
      default_comment: 'public',
    });
    expect(projects['DEV']).toEqual({ url: 'https://sd.atlassian.net' });
  });

  it('keeps the Confluence section and the default project', async () => {
    await handleSetProjectCommentDefault(tempDir, 'SD', 'internal');

    const config = await readConfig();
    expect(config['spaces']).toEqual({ DOCS: { url: 'https://sd.atlassian.net' } });
    expect(config['default_project']).toBe('SD');
  });

  it('rejects a value other than internal or public', async () => {
    await expect(handleSetProjectCommentDefault(tempDir, 'SD', 'private')).rejects.toThrow(
      'Invalid comment default "private". Supported: internal, public',
    );
  });

  it('rejects a project that is not configured', async () => {
    await expect(handleSetProjectCommentDefault(tempDir, 'NOPE', 'public')).rejects.toThrow(
      'Project "NOPE" is not configured',
    );
  });
});
