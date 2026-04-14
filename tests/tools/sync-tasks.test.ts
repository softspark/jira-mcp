/**
 * Tests for the sync_tasks tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleSyncTasks } from '../../src/tools/sync-tasks';
import { createMockSyncer, asSyncer } from '../fixtures/mocks';

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleSyncTasks', () => {
  it('returns count of synced tasks on success', async () => {
    const syncer = createMockSyncer();
    syncer.sync.mockResolvedValue(15);

    const result = await handleSyncTasks(
      {},
      { syncer: asSyncer(syncer) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['tasks_synced']).toBe(15);
    expect(parsed['message']).toBe('Synced 15 tasks');
  });

  it('passes jql option to syncer when provided', async () => {
    const syncer = createMockSyncer();
    syncer.sync.mockResolvedValue(3);

    await handleSyncTasks(
      { jql: 'project = PROJ' },
      { syncer: asSyncer(syncer) },
    );

    expect(syncer.sync).toHaveBeenCalledWith({ jql: 'project = PROJ' });
  });

  it('passes empty options when no jql is provided', async () => {
    const syncer = createMockSyncer();
    syncer.sync.mockResolvedValue(0);

    await handleSyncTasks({}, { syncer: asSyncer(syncer) });

    expect(syncer.sync).toHaveBeenCalledWith({});
  });

  it('returns failure when syncer throws', async () => {
    const syncer = createMockSyncer();
    syncer.sync.mockRejectedValue(new Error('Network timeout'));

    const result = await handleSyncTasks(
      {},
      { syncer: asSyncer(syncer) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(false);
    expect(parsed['error']).toBe('Network timeout');
  });
});
