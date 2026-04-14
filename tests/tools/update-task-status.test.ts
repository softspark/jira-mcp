/**
 * Tests for the update_task_status tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleUpdateTaskStatus } from '../../src/tools/update-task-status';
import { JiraConnectionError } from '../../src/errors/index';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';
import { createTaskData } from '../fixtures/tasks';

// Mock the TaskOperations class so we control its behaviour
vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.changeStatus = vi.fn();
  }),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleUpdateTaskStatus', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();
    pool.getConnectorForTask.mockReturnValue(connector);
    return { pool, cache, connector };
  }

  it('returns updated task on success', async () => {
    const { pool, cache } = setupDeps();
    const updatedTask = createTaskData({ key: 'PROJ-1', status: 'In Progress' });

    // Since we mock TaskOperations, we need to override the constructed instance
    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.changeStatus = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
        updatedTask,
      });
    });

    const result = await handleUpdateTaskStatus(
      { task_key: 'PROJ-1', status: 'In Progress' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toContain('In Progress');
  });

  it('returns failure when transition is not available', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.changeStatus = vi.fn().mockRejectedValue(
        new JiraConnectionError("Status 'Done' not available"),
      );
    });

    const result = await handleUpdateTaskStatus(
      { task_key: 'PROJ-1', status: 'Done' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('JIRA_CONNECTION');
  });
});
