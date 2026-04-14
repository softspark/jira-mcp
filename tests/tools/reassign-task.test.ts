/**
 * Tests for the reassign_task tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleReassignTask } from '../../src/tools/reassign-task';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';
import { createTaskData } from '../fixtures/tasks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(() => ({
    reassign: vi.fn(),
  })),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleReassignTask', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache };
  }

  it('returns reassigned task when email is provided', async () => {
    const { pool, cache } = setupDeps();
    const updatedTask = createTaskData({
      key: 'PROJ-1',
      assignee: 'new@example.com',
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          reassign: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            updatedTask,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleReassignTask(
      { task_key: 'PROJ-1', assignee_email: 'new@example.com' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toContain('Reassigned');
    expect(parsed['message']).toContain('new@example.com');
  });

  it('returns unassigned message when email is empty string', async () => {
    const { pool, cache } = setupDeps();
    const updatedTask = createTaskData({
      key: 'PROJ-1',
      assignee: null,
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          reassign: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            updatedTask,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleReassignTask(
      { task_key: 'PROJ-1', assignee_email: '' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toContain('Unassigned');
  });

  it('returns unassigned message when email is omitted', async () => {
    const { pool, cache } = setupDeps();
    const updatedTask = createTaskData({ key: 'PROJ-1', assignee: null });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          reassign: vi.fn().mockResolvedValue({
            taskKey: 'PROJ-1',
            updatedTask,
          }),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleReassignTask(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['message']).toContain('Unassigned');
  });

  it('returns failure on error', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(
      () =>
        ({
          reassign: vi.fn().mockRejectedValue(new Error('User not found')),
        }) as ReturnType<typeof vi.fn>,
    );

    const result = await handleReassignTask(
      { task_key: 'PROJ-1', assignee_email: 'bad@example.com' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
  });
});
