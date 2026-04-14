/**
 * Tests for `jira-mcp config set-credentials` handler.
 *
 * Validates read-modify-write behavior, Format A → B migration,
 * per-instance credential merging, and default credential updates.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { handleSetCredentials } from '../../src/cli/commands/config/set-credentials.js';
import { writeSecureFile } from '../../src/utils/fs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

async function readCredentials(dir: string): Promise<unknown> {
  const raw = await readFile(join(dir, 'credentials.json'), 'utf-8');
  return JSON.parse(raw);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-creds-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// New file (no existing credentials.json)
// ---------------------------------------------------------------------------

describe('new credentials file', () => {
  it('creates Format B with default when no --url', async () => {
    await handleSetCredentials(tempDir, 'user@example.com', 'token-123');

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'user@example.com', api_token: 'token-123' },
    });
  });

  it('creates Format B with default + instance when --url provided', async () => {
    await handleSetCredentials(
      tempDir,
      'user@example.com',
      'token-123',
      'https://team.atlassian.net',
    );

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'user@example.com', api_token: 'token-123' },
      instances: {
        'https://team.atlassian.net': {
          username: 'user@example.com',
          api_token: 'token-123',
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Migration from Format A (legacy)
// ---------------------------------------------------------------------------

describe('Format A migration', () => {
  it('migrates Format A to Format B when setting default', async () => {
    // Write legacy Format A
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({ username: 'old@example.com', api_token: 'old-token' }),
    );

    await handleSetCredentials(tempDir, 'new@example.com', 'new-token');

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'new@example.com', api_token: 'new-token' },
    });
  });

  it('migrates Format A to Format B, preserving old as default when adding instance', async () => {
    // Write legacy Format A
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({ username: 'old@example.com', api_token: 'old-token' }),
    );

    await handleSetCredentials(
      tempDir,
      'instance@example.com',
      'instance-token',
      'https://other.atlassian.net',
    );

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'old@example.com', api_token: 'old-token' },
      instances: {
        'https://other.atlassian.net': {
          username: 'instance@example.com',
          api_token: 'instance-token',
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Existing Format B
// ---------------------------------------------------------------------------

describe('existing Format B', () => {
  it('adds new instance without changing default or other instances', async () => {
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({
        default: { username: 'default@example.com', api_token: 'default-token' },
        instances: {
          'https://team-a.atlassian.net': {
            username: 'a@example.com',
            api_token: 'a-token',
          },
        },
      }),
    );

    await handleSetCredentials(
      tempDir,
      'b@example.com',
      'b-token',
      'https://team-b.atlassian.net',
    );

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'default@example.com', api_token: 'default-token' },
      instances: {
        'https://team-a.atlassian.net': {
          username: 'a@example.com',
          api_token: 'a-token',
        },
        'https://team-b.atlassian.net': {
          username: 'b@example.com',
          api_token: 'b-token',
        },
      },
    });
  });

  it('updates existing instance credential', async () => {
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({
        default: { username: 'default@example.com', api_token: 'default-token' },
        instances: {
          'https://team-a.atlassian.net': {
            username: 'old@example.com',
            api_token: 'old-token',
          },
        },
      }),
    );

    await handleSetCredentials(
      tempDir,
      'new@example.com',
      'new-token',
      'https://team-a.atlassian.net',
    );

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'default@example.com', api_token: 'default-token' },
      instances: {
        'https://team-a.atlassian.net': {
          username: 'new@example.com',
          api_token: 'new-token',
        },
      },
    });
  });

  it('updates default without changing instances', async () => {
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({
        default: { username: 'old-default@example.com', api_token: 'old-default-token' },
        instances: {
          'https://team-a.atlassian.net': {
            username: 'a@example.com',
            api_token: 'a-token',
          },
        },
      }),
    );

    await handleSetCredentials(tempDir, 'new-default@example.com', 'new-default-token');

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'new-default@example.com', api_token: 'new-default-token' },
      instances: {
        'https://team-a.atlassian.net': {
          username: 'a@example.com',
          api_token: 'a-token',
        },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles corrupted credentials.json gracefully (treats as new)', async () => {
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      'not valid json {{{',
    );

    await handleSetCredentials(tempDir, 'user@example.com', 'token-123');

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'user@example.com', api_token: 'token-123' },
    });
  });

  it('handles invalid schema in credentials.json gracefully (treats as new)', async () => {
    await writeSecureFile(
      join(tempDir, 'credentials.json'),
      JSON.stringify({ foo: 'bar' }),
    );

    await handleSetCredentials(tempDir, 'user@example.com', 'token-123');

    const result = await readCredentials(tempDir);
    expect(result).toEqual({
      default: { username: 'user@example.com', api_token: 'token-123' },
    });
  });
});
