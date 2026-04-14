/**
 * Tests for the add_templated_comment tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleAddTemplatedComment } from '../../src/tools/add-templated-comment';
import type { CommentTemplate } from '../../src/templates/types';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  createMockTemplateRegistry,
  asPool,
  asCacheManager,
  asRegistry,
} from '../fixtures/mocks';

vi.mock('../../src/operations/task-operations', () => ({
  TaskOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.addComment = vi.fn();
  }),
}));

// We must also mock renderTemplate to control its output
vi.mock('../../src/templates/renderer', () => ({
  renderTemplate: vi.fn(),
}));

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

function createTestTemplate(): CommentTemplate {
  return {
    id: 'status-update',
    name: 'Status Update',
    description: 'Post a status update',
    category: 'workflow',
    variables: [
      {
        name: 'status',
        description: 'Current status',
        required: true,
        example: 'In Progress',
      },
    ],
    body: 'Status: {{status}}',
  };
}

describe('handleAddTemplatedComment', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const registry = createMockTemplateRegistry();
    pool.getConnectorForTask.mockReturnValue(createMockConnector());
    return { pool, cache, registry };
  }

  it('returns failure when both template_id and markdown are provided', async () => {
    const { pool, cache, registry } = setupDeps();

    const result = await handleAddTemplatedComment(
      {
        task_key: 'PROJ-1',
        template_id: 'status-update',
        markdown: '# Hello',
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toContain('not both');
  });

  it('returns failure when neither template_id nor markdown is provided', async () => {
    const { pool, cache, registry } = setupDeps();

    const result = await handleAddTemplatedComment(
      { task_key: 'PROJ-1' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toContain('template_id');
  });

  it('renders template and adds comment in template mode', async () => {
    const { pool, cache, registry } = setupDeps();

    const template = createTestTemplate();
    registry.getTemplate.mockReturnValue(template);

    const { renderTemplate } = await import('../../src/templates/renderer');
    vi.mocked(renderTemplate).mockReturnValue({
      success: true,
      markdown: 'Status: In Progress',
    });

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
        commentId: 'c-1',
        author: 'user@example.com',
        bodyMarkdown: 'Status: In Progress',
        created: '2026-01-01T00:00:00.000Z',
      });
    });

    const result = await handleAddTemplatedComment(
      {
        task_key: 'PROJ-1',
        template_id: 'status-update',
        variables: { status: 'In Progress' },
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    const tplInfo = parsed['template'] as Record<string, unknown>;
    expect(tplInfo['template_id']).toBe('status-update');
    expect(tplInfo['template_name']).toBe('Status Update');
  });

  it('returns failure when template rendering fails (missing variable)', async () => {
    const { pool, cache, registry } = setupDeps();

    registry.getTemplate.mockReturnValue(createTestTemplate());

    const { renderTemplate } = await import('../../src/templates/renderer');
    vi.mocked(renderTemplate).mockReturnValue({
      success: false,
      error: 'Missing required variables: status',
      missingVariables: ['status'],
    });

    const result = await handleAddTemplatedComment(
      {
        task_key: 'PROJ-1',
        template_id: 'status-update',
        variables: {},
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toContain('Missing required variables');
  });

  it('uses raw markdown when markdown is provided', async () => {
    const { pool, cache, registry } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = vi.fn().mockResolvedValue({
        taskKey: 'PROJ-1',
        commentId: 'c-2',
        author: 'user@example.com',
        bodyMarkdown: '# Raw markdown',
        created: '2026-01-01T00:00:00.000Z',
      });
    });

    const result = await handleAddTemplatedComment(
      { task_key: 'PROJ-1', markdown: '# Raw markdown' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    // No template info in raw markdown mode
    expect(parsed['template']).toBeUndefined();
    expect(parsed['message']).toBe('Added comment to PROJ-1');
  });

  it('returns failure when addComment throws in markdown mode', async () => {
    const { pool, cache, registry } = setupDeps();

    const { TaskOperations } = await import('../../src/operations/task-operations');
    vi.mocked(TaskOperations).mockImplementation(function (this: Record<string, unknown>) {
      this.addComment = vi.fn().mockRejectedValue(new Error('API error'));
    });

    const result = await handleAddTemplatedComment(
      { task_key: 'PROJ-1', markdown: 'Test' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        templateRegistry: asRegistry(registry),
      },
    );

    expect(result.isError).toBe(true);
  });
});
