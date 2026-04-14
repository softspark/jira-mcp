/**
 * Tests for the read_cached_tasks tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleReadCachedTasks } from '../../src/tools/read-cached-tasks';
import { TaskNotFoundError } from '../../src/errors/index';
import { createMockCacheManager, asCacheManager } from '../fixtures/mocks';
import { createTaskData } from '../fixtures/tasks';

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleReadCachedTasks', () => {
  it('returns a single task when task_key is provided', async () => {
    const cache = createMockCacheManager();
    const task = createTaskData({ key: 'PROJ-42' });
    cache.getTask.mockResolvedValue(task);

    const result = await handleReadCachedTasks(
      { task_key: 'PROJ-42' },
      { cacheManager: asCacheManager(cache) },
    );

    expect(cache.getTask).toHaveBeenCalledWith('PROJ-42');
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect((parsed['task'] as Record<string, unknown>)['key']).toBe('PROJ-42');
  });

  it('returns all tasks when no task_key is provided', async () => {
    const cache = createMockCacheManager();
    const tasks = [
      createTaskData({ key: 'PROJ-1' }),
      createTaskData({ key: 'PROJ-2' }),
    ];
    cache.getAllTasks.mockResolvedValue(tasks);

    const result = await handleReadCachedTasks(
      {},
      { cacheManager: asCacheManager(cache) },
    );

    expect(cache.getAllTasks).toHaveBeenCalled();
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(2);
    expect(parsed['tasks']).toHaveLength(2);
  });

  it('returns empty array when cache has no tasks', async () => {
    const cache = createMockCacheManager();
    cache.getAllTasks.mockResolvedValue([]);

    const result = await handleReadCachedTasks(
      {},
      { cacheManager: asCacheManager(cache) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(0);
    expect(parsed['tasks']).toEqual([]);
  });

  it('returns failure when task is not found', async () => {
    const cache = createMockCacheManager();
    cache.getTask.mockRejectedValue(
      new TaskNotFoundError('Task PROJ-999 not found in cache'),
    );

    const result = await handleReadCachedTasks(
      { task_key: 'PROJ-999' },
      { cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(false);
    expect(parsed['code']).toBe('TASK_NOT_FOUND');
  });

  it('returns failure when cache load throws', async () => {
    const cache = createMockCacheManager();
    cache.getAllTasks.mockRejectedValue(new Error('Disk read failed'));

    const result = await handleReadCachedTasks(
      {},
      { cacheManager: asCacheManager(cache) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Disk read failed');
  });
});
