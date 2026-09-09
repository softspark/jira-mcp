// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `jira-mcp cache sync-workflows` command handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createMergedConfig } from '@softspark/atlassian-mcp-core/test-fixtures';

const loadConfigMock = vi.hoisted(() => vi.fn());
const syncAllMock = vi.hoisted(() => vi.fn());

// loadConfig lives in the shared core package. This mock MUST resolve: an
// unresolved path is silently a no-op, the real loader then reads the
// developer's own ~/.softspark/jira-mcp/credentials.json, and a failing
// assertion prints their live API token into the test output.
vi.mock('@softspark/atlassian-mcp-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, loadConfig: loadConfigMock };
});

vi.mock('../../../../src/cache/workflow-cache', () => ({
  WorkflowCacheManager: class {
    constructor(readonly cachePath?: string) {}
    async syncAll(pool: unknown, config: unknown): Promise<number> {
      return syncAllMock(pool, config) as Promise<number>;
    }
  },
}));

import { handleSyncWorkflows } from '../../../../src/cli/commands/cache/sync-workflows';
import { InstancePool } from '../../../../src/connector/instance-pool';

beforeEach(() => {
  vi.clearAllMocks();
  loadConfigMock.mockResolvedValue(createMergedConfig());
});

describe('handleSyncWorkflows', () => {
  it('returns the synced project count', async () => {
    syncAllMock.mockResolvedValue(3);

    const result = await handleSyncWorkflows('/tmp/workflows.json');

    expect(result).toEqual({ projectCount: 3 });
  });

  it('passes the pool and the loaded config to syncAll', async () => {
    const config = createMergedConfig();
    loadConfigMock.mockResolvedValue(config);
    syncAllMock.mockResolvedValue(0);

    await handleSyncWorkflows();

    expect(syncAllMock.mock.calls[0]?.[0]).toBeInstanceOf(InstancePool);
    expect(syncAllMock.mock.calls[0]?.[1]).toBe(config);
  });

  it('propagates sync failures', async () => {
    syncAllMock.mockRejectedValue(new Error('HTTP 503'));

    await expect(handleSyncWorkflows()).rejects.toThrow('HTTP 503');
  });
});
