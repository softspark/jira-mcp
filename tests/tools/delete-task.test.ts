/**
 * Tests for the delete_task tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleDeleteTask } from '../../src/tools/delete-task';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.deleteTask = vi.fn();
  }),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleDeleteTask', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();
    pool.getConnectorForTask.mockReturnValue(connector);
    return { pool, cache };
  }

  it('returns deleted task details on success', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.deleteTask = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
      });
    });

    const result = await handleDeleteTask(
      { task_key: 'PROJ-1', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toBe('Deleted task PROJ-1');
    expect(parsed['deleted']).toEqual({ task_key: 'PROJ-1' });
  });

  it('returns failure when deleteTask throws', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.deleteTask = vi.fn().mockRejectedValue(new Error('Task PROJ-1 can only be deleted by its creator.'));
    });

    const result = await handleDeleteTask(
      { task_key: 'PROJ-1', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Task PROJ-1 can only be deleted by its creator.');
  });

  it('blocks task delete when user approval is missing', async () => {
    const { pool, cache } = setupDeps();

    const result = await handleDeleteTask(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('DELETION_APPROVAL_REQUIRED');
  });
});
