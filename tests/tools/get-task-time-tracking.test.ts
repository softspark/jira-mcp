/**
 * Tests for the get_task_time_tracking tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleGetTaskTimeTracking } from '../../src/tools/get-task-time-tracking';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(() => ({
    getTimeTracking: vi.fn(),
  })),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleGetTaskTimeTracking', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache };
  }

  it('returns time tracking data on success', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          getTimeTracking: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            originalEstimate: '8h',
            timeSpent: '2h 30m',
            remainingEstimate: '5h 30m',
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleGetTaskTimeTracking(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['task_key']).toBe('PROJ-1');

    const tracking = parsed['time_tracking'] as Record<string, unknown>;
    expect(tracking['original_estimate']).toBe('8h');
    expect(tracking['time_spent']).toBe('2h 30m');
    expect(tracking['remaining_estimate']).toBe('5h 30m');
  });

  it('returns null values when no time is tracked', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          getTimeTracking: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            originalEstimate: null,
            timeSpent: null,
            remainingEstimate: null,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleGetTaskTimeTracking(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    const tracking = parsed['time_tracking'] as Record<string, unknown>;
    expect(tracking['original_estimate']).toBeNull();
    expect(tracking['time_spent']).toBeNull();
  });

  it('returns failure on error', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          getTimeTracking: vi.fn().mockRejectedValue(new Error('API error')),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleGetTaskTimeTracking(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
  });
});
