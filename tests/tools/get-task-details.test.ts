/**
 * Tests for the get_task_details tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleGetTaskDetails } from '../../src/tools/get-task-details';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';
import { createMergedConfig } from '../fixtures/config';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getTaskDetails = vi.fn();
  }),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleGetTaskDetails', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache };
  }

  it('returns task details on success', async () => {
    const { pool, cache } = setupDeps();

    const taskDetail = {
      key: 'PROJ-1',
      summary: 'Test task',
      description: '# Description',
      status: 'To Do',
      assignee: 'user@example.com',
      priority: 'Medium',
      issueType: 'Task',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      comments: [
        {
          id: 'c-1',
          author: 'user@example.com',
          body: 'Some comment',
          created: '2026-01-02T00:00:00.000Z',
        },
      ],
    };

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.getTaskDetails = vi.fn().mockResolvedValue(taskDetail);
    });

    const result = await handleGetTaskDetails(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: createMergedConfig() },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toBe('Retrieved details for PROJ-1');
    expect(parsed['language']).toBe('pl');

    const task = parsed['task'] as Record<string, unknown>;
    expect(task['key']).toBe('PROJ-1');
    expect(task['description']).toBe('# Description');
  });

  it('returns failure on error', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.getTaskDetails = vi.fn().mockRejectedValue(new Error('Not found'));
    });

    const result = await handleGetTaskDetails(
      { task_key: 'PROJ-999' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: createMergedConfig() },
    );

    expect(result.isError).toBe(true);
  });
});
