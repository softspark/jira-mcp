/**
 * Tests for the update_task tool handler.
 */

import { describe, it, expect, vi } from 'vitest';

import { handleUpdateTask } from '../../src/tools/update-task';
import type { UpdateTaskDeps } from '../../src/tools/update-task';

function makeDeps(overrides?: Partial<UpdateTaskDeps>): UpdateTaskDeps {
  const mockConnector = {
    updateIssue: vi.fn().mockResolvedValue(undefined),
  };

  return {
    pool: {
      getConnector: vi.fn().mockReturnValue(mockConnector),
      ...(overrides?.pool as Record<string, unknown>),
    } as unknown as UpdateTaskDeps['pool'],
    ...overrides,
  };
}

describe('handleUpdateTask', () => {
  it('updates description with ADF conversion', async () => {
    const deps = makeDeps();
    const result = await handleUpdateTask(
      { task_key: 'DEVOPS-37', description: '## New heading\n\nNew paragraph' },
      deps,
    );

    expect(result.content[0]?.text).toContain('Updated DEVOPS-37');
    const connector = (deps.pool.getConnector as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(connector.updateIssue).toHaveBeenCalledWith(
      'DEVOPS-37',
      expect.objectContaining({
        description: expect.objectContaining({ type: 'doc', version: 1 }),
      }),
    );
  });

  it('updates summary only', async () => {
    const deps = makeDeps();
    const result = await handleUpdateTask(
      { task_key: 'PROJ-1', summary: 'New title' },
      deps,
    );

    expect(result.content[0]?.text).toContain('summary');
    const connector = (deps.pool.getConnector as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(connector.updateIssue).toHaveBeenCalledWith(
      'PROJ-1',
      { summary: 'New title' },
    );
  });

  it('updates labels', async () => {
    const deps = makeDeps();
    const result = await handleUpdateTask(
      { task_key: 'PROJ-1', labels: ['bug', 'urgent'] },
      deps,
    );

    expect(result.content[0]?.text).toContain('labels');
  });

  it('fails when no fields provided', async () => {
    const deps = makeDeps();
    const result = await handleUpdateTask(
      { task_key: 'PROJ-1' },
      deps,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No fields to update');
  });

  it('updates multiple fields at once', async () => {
    const deps = makeDeps();
    const result = await handleUpdateTask(
      { task_key: 'PROJ-1', summary: 'New', description: 'Desc', priority: 'Critical' },
      deps,
    );

    expect(result.content[0]?.text).toContain('summary');
    expect(result.content[0]?.text).toContain('description');
    expect(result.content[0]?.text).toContain('priority');
  });
});
