/**
 * Tests for the get_task_statuses tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleGetTaskStatuses } from '../../src/tools/get-task-statuses';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(() => ({
    getAvailableStatuses: vi.fn(),
  })),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleGetTaskStatuses', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache };
  }

  it('returns mapped status transitions on success', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          getAvailableStatuses: vi.fn().mockResolvedValue([
            { id: '11', name: 'Start Progress', toStatus: 'In Progress' },
            { id: '21', name: 'Done', toStatus: 'Done' },
          ]),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleGetTaskStatuses(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['task_key']).toBe('PROJ-1');

    const statuses = parsed['statuses'] as Array<Record<string, unknown>>;
    expect(statuses).toHaveLength(2);
    expect(statuses[0]!['id']).toBe('11');
    expect(statuses[0]!['name']).toBe('Start Progress');
    expect(statuses[0]!['to_status']).toBe('In Progress');
  });

  it('returns failure on error', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          getAvailableStatuses: vi.fn().mockRejectedValue(
            new Error('Connection refused'),
          ),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleGetTaskStatuses(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
  });
});
