// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `jira-mcp cache sync-users` command handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createMergedConfig } from '../../../fixtures/config';

const loadConfigMock = vi.hoisted(() => vi.fn());
const syncAllMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/config/loader', () => ({
  loadConfig: loadConfigMock,
}));

vi.mock('../../../../src/cache/user-cache', () => ({
  UserCacheManager: class {
    constructor(readonly cachePath?: string) {}
    async syncAll(pool: unknown): Promise<number> {
      return syncAllMock(pool) as Promise<number>;
    }
  },
}));

import { handleSyncUsers } from '../../../../src/cli/commands/cache/sync-users';
import { InstancePool } from '../../../../src/connector/instance-pool';

beforeEach(() => {
  vi.clearAllMocks();
  loadConfigMock.mockResolvedValue(createMergedConfig());
});

describe('handleSyncUsers', () => {
  it('returns the synced user count', async () => {
    syncAllMock.mockResolvedValue(7);

    const result = await handleSyncUsers('/tmp/users.json');

    expect(result).toEqual({ userCount: 7 });
  });

  it('passes an InstancePool built from the loaded config', async () => {
    syncAllMock.mockResolvedValue(0);

    await handleSyncUsers();

    expect(loadConfigMock).toHaveBeenCalledOnce();
    expect(syncAllMock.mock.calls[0]?.[0]).toBeInstanceOf(InstancePool);
  });

  it('propagates sync failures', async () => {
    syncAllMock.mockRejectedValue(new Error('network down'));

    await expect(handleSyncUsers()).rejects.toThrow('network down');
  });
});
