/**
 * Tests for the delete_comment tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleDeleteComment } from '../../src/tools/delete-comment';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.deleteComment = vi.fn();
  }),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleDeleteComment', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();
    pool.getConnectorForTask.mockReturnValue(connector);
    return { pool, cache };
  }

  it('returns deleted comment details on success', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.deleteComment = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
        commentId: 'c-1',
      });
    });

    const result = await handleDeleteComment(
      { task_key: 'PROJ-1', comment_id: 'c-1', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['message']).toBe('Deleted comment c-1 from PROJ-1');
    expect(parsed['deleted']).toEqual({ task_key: 'PROJ-1', comment_id: 'c-1' });
  });

  it('returns failure when deleteComment throws', async () => {
    const { pool, cache } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.deleteComment = vi.fn().mockRejectedValue(new Error('Comment c-1 on PROJ-1 can only be deleted by its author.'));
    });

    const result = await handleDeleteComment(
      { task_key: 'PROJ-1', comment_id: 'c-1', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Comment c-1 on PROJ-1 can only be deleted by its author.');
  });

  it('blocks comment delete when user approval is missing', async () => {
    const { pool, cache } = setupDeps();

    const result = await handleDeleteComment(
      { task_key: 'PROJ-1', comment_id: 'c-1' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('DELETION_APPROVAL_REQUIRED');
  });
});
