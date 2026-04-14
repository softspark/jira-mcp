/**
 * Tests for the log_task_time tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleLogTaskTime } from '../../src/tools/log-task-time';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(() => ({
    logTime: vi.fn(),
  })),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleLogTaskTime', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache };
  }

  it('returns worklog details on success with comment', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          logTime: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            worklogId: 'wl-100',
            timeSpent: '2h 30m',
            timeSpentSeconds: 9000,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleLogTaskTime(
      { task_key: 'PROJ-1', time_spent: '2h 30m', comment: 'Did some work' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['worklog_id']).toBe('wl-100');
    expect(parsed['time_spent']).toBe('2h 30m');
    expect(parsed['time_spent_seconds']).toBe(9000);
    expect(parsed['message']).toBe('Logged 2h 30m to PROJ-1');
  });

  it('works without optional comment', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          logTime: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            worklogId: 'wl-200',
            timeSpent: '1h',
            timeSpentSeconds: 3600,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleLogTaskTime(
      { task_key: 'PROJ-1', time_spent: '1h' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['time_spent_seconds']).toBe(3600);
  });

  it('returns failure for invalid time format', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          logTime: vi.fn().mockRejectedValue(
            new Error("Invalid time format: 'abc'"),
          ),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleLogTaskTime(
      { task_key: 'PROJ-1', time_spent: 'abc' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toContain('Invalid time format');
  });

  it('returns failure on API error', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          logTime: vi.fn().mockRejectedValue(new Error('API timeout')),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleLogTaskTime(
      { task_key: 'PROJ-1', time_spent: '2h' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
  });
});
