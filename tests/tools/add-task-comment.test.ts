/**
 * Tests for the add_task_comment tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleAddTaskComment } from '../../src/tools/add-task-comment';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.addComment = vi.fn();
  }),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleAddTaskComment', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();
    pool.getConnectorForTask.mockReturnValue(connector);
    return { pool, cache };
  }

  it('returns comment details on success', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
        commentId: 'c-123',
        author: 'user@example.com',
        bodyMarkdown: 'Hello world',
        created: '2026-01-01T00:00:00.000Z',
      });
    });

    const result = await handleAddTaskComment(
      { task_key: 'PROJ-1', comment: 'Hello world' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    const comment = parsed['comment'] as Record<string, unknown>;
    expect(comment['id']).toBe('c-123');
    expect(comment['author']).toBe('user@example.com');
    expect(parsed['message']).toBe('Added comment to PROJ-1');
  });

  it('returns failure when addComment throws', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = vi.fn().mockRejectedValue(new Error('Permission denied'));
    });

    const result = await handleAddTaskComment(
      { task_key: 'PROJ-1', comment: 'test' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Permission denied');
  });
});
