// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `jira-mcp config set-tempo-token` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleSetTempoToken } from '../../../../src/cli/commands/config/set-tempo-token';
import { handleSetCredentials } from '../../../../src/cli/commands/config/set-credentials';

let tempDir: string;
let configDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-tempo-'));
  configDir = join(tempDir, 'jira-mcp');
  await mkdir(configDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function readCredentials(): Promise<Record<string, unknown>> {
  const raw = await readFile(join(configDir, 'credentials.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('handleSetTempoToken', () => {
  it('refuses to run before Jira credentials exist', async () => {
    await expect(handleSetTempoToken(configDir, 'tempo-1')).rejects.toThrow(
      'No Jira credentials found',
    );
  });

  it('adds the token to the default credential', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');

    await handleSetTempoToken(configDir, 'tempo-1');

    expect(await readCredentials()).toEqual({
      default: {
        username: 'user@example.com',
        api_token: 'jira-1',
        tempo_token: 'tempo-1',
      },
    });
  });

  it('migrates a legacy Format A file while adding the token', async () => {
    await writeFile(
      join(configDir, 'credentials.json'),
      JSON.stringify({ username: 'legacy@example.com', api_token: 'jira-legacy' }),
    );

    await handleSetTempoToken(configDir, 'tempo-1');

    expect(await readCredentials()).toEqual({
      default: {
        username: 'legacy@example.com',
        api_token: 'jira-legacy',
        tempo_token: 'tempo-1',
      },
    });
  });

  it('creates a per-instance entry from the default when --url names a new site', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');

    await handleSetTempoToken(configDir, 'tempo-b', 'https://b.atlassian.net');

    expect(await readCredentials()).toEqual({
      default: { username: 'user@example.com', api_token: 'jira-1' },
      instances: {
        'https://b.atlassian.net': {
          username: 'user@example.com',
          api_token: 'jira-1',
          tempo_token: 'tempo-b',
        },
      },
    });
  });

  it('keeps an existing per-instance Jira credential when adding its token', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');
    await handleSetCredentials(configDir, 'b@example.com', 'jira-b', 'https://b.atlassian.net');

    await handleSetTempoToken(configDir, 'tempo-b', 'https://b.atlassian.net');

    const parsed = await readCredentials();
    expect(parsed['instances']).toEqual({
      'https://b.atlassian.net': {
        username: 'b@example.com',
        api_token: 'jira-b',
        tempo_token: 'tempo-b',
      },
    });
    expect(parsed['default']).toEqual({
      username: 'user@example.com',
      api_token: 'jira-1',
    });
  });

  it('overwrites a previous token in the same slot', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');
    await handleSetTempoToken(configDir, 'tempo-old');

    await handleSetTempoToken(configDir, 'tempo-new');

    const parsed = await readCredentials();
    expect((parsed['default'] as Record<string, unknown>)['tempo_token']).toBe('tempo-new');
  });
});

describe('handleSetCredentials keeps the Tempo token', () => {
  it('when the default Jira token is rotated', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');
    await handleSetTempoToken(configDir, 'tempo-1');

    await handleSetCredentials(configDir, 'user@example.com', 'jira-2');

    expect(await readCredentials()).toEqual({
      default: {
        username: 'user@example.com',
        api_token: 'jira-2',
        tempo_token: 'tempo-1',
      },
    });
  });

  it('when a per-instance Jira token is rotated', async () => {
    await handleSetCredentials(configDir, 'user@example.com', 'jira-1');
    await handleSetTempoToken(configDir, 'tempo-b', 'https://b.atlassian.net');

    await handleSetCredentials(configDir, 'b@example.com', 'jira-b2', 'https://b.atlassian.net');

    const parsed = await readCredentials();
    expect(parsed['instances']).toEqual({
      'https://b.atlassian.net': {
        username: 'b@example.com',
        api_token: 'jira-b2',
        tempo_token: 'tempo-b',
      },
    });
  });
});
