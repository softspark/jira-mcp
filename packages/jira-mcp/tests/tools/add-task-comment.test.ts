// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

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
import { createMergedConfig } from '@softspark/atlassian-mcp-core/test-fixtures';

const TEST_CONFIG = createMergedConfig();

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
      { task_key: 'PROJ-1', comment: 'Hello world', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
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
      { task_key: 'PROJ-1', comment: 'test', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Permission denied');
  });

  it('blocks comment add when user approval is missing', async () => {
    const { pool, cache } = setupDeps();

    const result = await handleAddTaskComment(
      { task_key: 'PROJ-1', comment: 'Hello world' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('COMMENT_APPROVAL_REQUIRED');
  });

  it('passes visibility to addComment and returns the stored restriction', async () => {
    const { pool, cache } = setupDeps();
    const visibility = { type: 'role', value: 'Administrators' };
    const addComment = vi.fn().mockResolvedValue({
      taskKey: 'PROJ-1',
      commentId: 'c-124',
      author: 'user@example.com',
      bodyMarkdown: 'Internal note',
      created: '2026-01-01T00:00:00.000Z',
      visibility,
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = addComment;
    });

    const result = await handleAddTaskComment(
      { task_key: 'PROJ-1', comment: 'Internal note', user_approved: true, visibility },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(addComment).toHaveBeenCalledWith('PROJ-1', 'Internal note', { visibility });
    const comment = parseResult(result)['comment'] as Record<string, unknown>;
    expect(comment['visibility']).toEqual(visibility);
  });

  it('passes internal to addComment and reports it', async () => {
    const { pool, cache } = setupDeps();
    const addComment = vi.fn().mockResolvedValue({
      taskKey: 'SD-1',
      commentId: 'c-125',
      author: 'agent@example.com',
      bodyMarkdown: 'Internal note',
      created: '2026-01-01T00:00:00.000Z',
      visibility: null,
      internal: true,
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = addComment;
    });

    const result = await handleAddTaskComment(
      { task_key: 'SD-1', comment: 'Internal note', user_approved: true, internal: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(addComment).toHaveBeenCalledWith('SD-1', 'Internal note', { internal: true });
    const comment = parseResult(result)['comment'] as Record<string, unknown>;
    expect(comment['internal']).toBe(true);
  });

  it('hands the project default_comment to addComment as the fallback', async () => {
    const { pool, cache } = setupDeps();
    const base = createMergedConfig();
    const config = createMergedConfig({
      projects: { ...base.projects, SD: { ...base.projects['PROJ0']!, default_comment: 'internal' } },
    });
    const addComment = vi.fn().mockResolvedValue({
      taskKey: 'SD-2',
      commentId: 'c-126',
      author: 'agent@example.com',
      bodyMarkdown: 'Reply',
      created: '2026-01-01T00:00:00.000Z',
      visibility: null,
      internal: false,
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = addComment;
    });

    await handleAddTaskComment(
      { task_key: 'SD-2', comment: 'Reply', user_approved: true },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config },
    );

    expect(addComment).toHaveBeenCalledWith('SD-2', 'Reply', { serviceDefault: 'internal' });
  });

  it('rejects internal given as a string instead of silently posting a public reply', async () => {
    const { pool, cache } = setupDeps();
    const addComment = vi.fn();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = addComment;
    });

    const result = await handleAddTaskComment(
      { task_key: 'SD-1', comment: 'Internal note', user_approved: true, internal: 'true' },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('INVALID_INPUT');
    expect(parsed['error']).toContain('internal');
    expect(addComment).not.toHaveBeenCalled();
  });

  it('rejects an invalid visibility before calling Jira', async () => {
    const { pool, cache } = setupDeps();
    const addComment = vi.fn();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = addComment;
    });

    const result = await handleAddTaskComment(
      {
        task_key: 'PROJ-1',
        comment: 'Internal note',
        user_approved: true,
        visibility: { type: 'role' },
      },
      { pool: asPool(pool), cacheManager: asCacheManager(cache), config: TEST_CONFIG },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('INVALID_INPUT');
    expect(parsed['error']).toContain('visibility.value');
    expect(addComment).not.toHaveBeenCalled();
  });
});
