/**
 * Tests for `jira-mcp cache list-users` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleListUsers } from '../../../../src/cli/commands/cache/list-users';
import type { UserCacheData } from '../../../../src/cache/user-types';

let tempDir: string;

async function setupUserCache(data: UserCacheData): Promise<string> {
  const cacheDir = join(tempDir, 'cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, 'users.json'), JSON.stringify(data));
  return cacheDir;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-list-users-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleListUsers', () => {
  it('returns all cached users', async () => {
    const data: UserCacheData = {
      last_sync: '2026-01-01T00:00:00.000Z',
      instances: {
        'https://test.atlassian.net': {
          users: [
            {
              account_id: 'abc-123',
              email: 'alice@test.com',
              display_name: 'Alice',
              active: true,
            },
            {
              account_id: 'def-456',
              email: 'bob@test.com',
              display_name: 'Bob',
              active: false,
            },
          ],
        },
      },
    };
    const cacheDir = await setupUserCache(data);

    const users = await handleListUsers(cacheDir);

    expect(users).toHaveLength(2);
    expect(users[0]?.display_name).toBe('Alice');
    expect(users[1]?.display_name).toBe('Bob');
  });

  it('returns empty array when cache file does not exist', async () => {
    const cacheDir = join(tempDir, 'empty-cache');
    await mkdir(cacheDir, { recursive: true });

    const users = await handleListUsers(cacheDir);

    expect(users).toHaveLength(0);
  });

  it('deduplicates users across instances', async () => {
    const data: UserCacheData = {
      last_sync: '2026-01-01T00:00:00.000Z',
      instances: {
        'https://a.atlassian.net': {
          users: [
            {
              account_id: 'shared',
              email: 'user@test.com',
              display_name: 'User',
              active: true,
            },
          ],
        },
        'https://b.atlassian.net': {
          users: [
            {
              account_id: 'shared',
              email: 'user@test.com',
              display_name: 'User',
              active: true,
            },
          ],
        },
      },
    };
    const cacheDir = await setupUserCache(data);

    const users = await handleListUsers(cacheDir);

    expect(users).toHaveLength(1);
    expect(users[0]?.account_id).toBe('shared');
  });
});
