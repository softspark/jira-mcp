/**
 * Tests for the UserCacheManager.
 *
 * Uses real filesystem with temp directories for isolation.
 * Mocked JiraConnector for sync operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { UserCacheManager } from '../../src/cache/user-cache';
import { CacheCorruptionError } from '../../src/errors/index';
import {
  createMockConnector,
  createMockInstancePool,
  asConnector,
  asPool,
} from '../fixtures/mocks';
import type { UserCacheData } from '../../src/cache/user-types';
import type { JiraUser } from '../../src/connector/types';
import type { PooledInstance } from '../../src/connector/instance-pool';

let tempDir: string;
let cachePath: string;
let manager: UserCacheManager;

function createValidCacheData(
  overrides?: Partial<UserCacheData>,
): UserCacheData {
  return {
    last_sync: '2026-01-01T00:00:00.000Z',
    instances: {},
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-users-'));
  cachePath = join(tempDir, 'users.json');
  manager = new UserCacheManager(cachePath);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('UserCacheManager.load', () => {
  it('returns null when cache file does not exist', async () => {
    const result = await manager.load();
    expect(result).toBeNull();
  });

  it('loads valid cache data from disk', async () => {
    const data = createValidCacheData({
      instances: {
        'https://test.atlassian.net': {
          users: [
            {
              account_id: 'abc-123',
              email: 'user@test.com',
              display_name: 'Test User',
              active: true,
            },
          ],
        },
      },
    });
    await writeFile(cachePath, JSON.stringify(data), 'utf-8');

    const result = await manager.load();

    expect(result).not.toBeNull();
    expect(
      result?.instances['https://test.atlassian.net']?.users,
    ).toHaveLength(1);
  });

  it('throws CacheCorruptionError for invalid JSON', async () => {
    await writeFile(cachePath, '{not valid json!!!', 'utf-8');

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });

  it('throws CacheCorruptionError for invalid schema', async () => {
    await writeFile(
      cachePath,
      JSON.stringify({ wrong: 'shape' }),
      'utf-8',
    );

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });
});

describe('UserCacheManager.save', () => {
  it('roundtrips data through save and load', async () => {
    const data = createValidCacheData({
      instances: {
        'https://test.atlassian.net': {
          users: [
            {
              account_id: 'abc-123',
              email: 'user@test.com',
              display_name: 'Test User',
              active: true,
            },
          ],
        },
      },
    });

    await manager.save(data);
    const loaded = await manager.load();

    expect(loaded).toEqual(data);
  });

  it('performs atomic write (no .tmp file after success)', async () => {
    const data = createValidCacheData();
    await manager.save(data);

    const tmpPath = `${cachePath}.tmp`;
    await expect(access(tmpPath)).rejects.toThrow();
  });

  it('creates parent directories if missing', async () => {
    const nestedPath = join(tempDir, 'a', 'b', 'users.json');
    const nestedManager = new UserCacheManager(nestedPath);

    await nestedManager.save(createValidCacheData());
    const loaded = await nestedManager.load();

    expect(loaded).not.toBeNull();
  });
});

describe('UserCacheManager.syncInstance', () => {
  it('maps users from connector response correctly', async () => {
    const mockConnector = createMockConnector();
    const apiUsers: JiraUser[] = [
      {
        accountId: 'abc-123',
        emailAddress: 'alice@test.com',
        displayName: 'Alice',
        active: true,
      },
      {
        accountId: 'def-456',
        emailAddress: null,
        displayName: 'Bob',
        active: false,
      },
    ];
    mockConnector.searchUsers.mockResolvedValue(apiUsers);

    const count = await manager.syncInstance(
      'https://test.atlassian.net',
      asConnector(mockConnector),
    );

    expect(count).toBe(2);
    expect(mockConnector.searchUsers).toHaveBeenCalledWith('', 1000);
  });

  it('merges new instance data with existing cache', async () => {
    // Pre-populate with instance A
    const existing = createValidCacheData({
      instances: {
        'https://a.atlassian.net': {
          users: [
            {
              account_id: 'aaa',
              email: 'a@test.com',
              display_name: 'User A',
              active: true,
            },
          ],
        },
      },
    });
    await manager.save(existing);
    await manager.load();

    // Sync instance B
    const mockConnector = createMockConnector();
    mockConnector.searchUsers.mockResolvedValue([
      {
        accountId: 'bbb',
        emailAddress: 'b@test.com',
        displayName: 'User B',
        active: true,
      },
    ]);

    await manager.syncInstance(
      'https://b.atlassian.net',
      asConnector(mockConnector),
    );

    // Reload to verify both instances exist
    await manager.load();
    const allUsers = manager.getAllUsers();
    expect(allUsers).toHaveLength(2);
  });
});

describe('UserCacheManager.syncAll', () => {
  it('syncs all unique instances from pool', async () => {
    const mockConnectorA = createMockConnector('https://a.atlassian.net');
    mockConnectorA.searchUsers.mockResolvedValue([
      {
        accountId: 'aaa',
        emailAddress: 'a@test.com',
        displayName: 'User A',
        active: true,
      },
    ]);

    const mockConnectorB = createMockConnector('https://b.atlassian.net');
    mockConnectorB.searchUsers.mockResolvedValue([
      {
        accountId: 'bbb',
        emailAddress: 'b@test.com',
        displayName: 'User B',
        active: true,
      },
    ]);

    const instances = new Map<string, PooledInstance>([
      [
        'https://a.atlassian.net',
        {
          connector: asConnector(mockConnectorA),
          projectKeys: ['PROJ_A'],
        },
      ],
      [
        'https://b.atlassian.net',
        {
          connector: asConnector(mockConnectorB),
          projectKeys: ['PROJ_B'],
        },
      ],
    ]);

    const mockPool = createMockInstancePool();
    mockPool.getInstances.mockReturnValue(instances);

    const total = await manager.syncAll(asPool(mockPool));

    expect(total).toBe(2);
  });
});

describe('UserCacheManager.resolveEmail', () => {
  beforeEach(async () => {
    const data = createValidCacheData({
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
              email: null,
              display_name: 'Bob',
              active: true,
            },
          ],
        },
      },
    });
    await manager.save(data);
    await manager.load();
  });

  it('finds user by email (case-insensitive)', () => {
    const accountId = manager.resolveEmail(
      'https://test.atlassian.net',
      'Alice@Test.com',
    );
    expect(accountId).toBe('abc-123');
  });

  it('returns null for unknown email', () => {
    const accountId = manager.resolveEmail(
      'https://test.atlassian.net',
      'unknown@test.com',
    );
    expect(accountId).toBeNull();
  });

  it('returns null for unknown instance', () => {
    const accountId = manager.resolveEmail(
      'https://unknown.atlassian.net',
      'alice@test.com',
    );
    expect(accountId).toBeNull();
  });

  it('returns null when data has not been loaded', () => {
    const freshManager = new UserCacheManager(cachePath);
    const accountId = freshManager.resolveEmail(
      'https://test.atlassian.net',
      'alice@test.com',
    );
    expect(accountId).toBeNull();
  });
});

describe('UserCacheManager.getAllUsers', () => {
  it('returns empty array when no data loaded', () => {
    expect(manager.getAllUsers()).toEqual([]);
  });

  it('deduplicates users across instances by account ID', async () => {
    const data = createValidCacheData({
      instances: {
        'https://a.atlassian.net': {
          users: [
            {
              account_id: 'shared-id',
              email: 'user@test.com',
              display_name: 'User',
              active: true,
            },
            {
              account_id: 'unique-a',
              email: 'a@test.com',
              display_name: 'User A',
              active: true,
            },
          ],
        },
        'https://b.atlassian.net': {
          users: [
            {
              account_id: 'shared-id',
              email: 'user@test.com',
              display_name: 'User',
              active: true,
            },
            {
              account_id: 'unique-b',
              email: 'b@test.com',
              display_name: 'User B',
              active: true,
            },
          ],
        },
      },
    });
    await manager.save(data);
    await manager.load();

    const allUsers = manager.getAllUsers();

    expect(allUsers).toHaveLength(3); // shared-id + unique-a + unique-b
    const accountIds = allUsers.map((u) => u.account_id);
    expect(accountIds).toContain('shared-id');
    expect(accountIds).toContain('unique-a');
    expect(accountIds).toContain('unique-b');
  });
});
