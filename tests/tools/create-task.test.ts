/**
 * Tests for the create_task tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleCreateTask } from '../../src/tools/create-task';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  createMockTaskTemplateRegistry,
  asPool,
  asCacheManager,
  asTaskRegistry,
} from '../fixtures/mocks';
import type { TaskTemplate } from '../../src/templates/task-types';

function parseResult(
  result: { content: Array<{ type: string; text?: string }> },
): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleCreateTask', () => {
  function setupDeps() {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();
    const taskRegistry = createMockTaskTemplateRegistry();
    pool.getConnector.mockReturnValue(connector);
    return { pool, cache, connector, taskRegistry };
  }

  it('creates a task with minimal args (project_key + summary)', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    connector.createIssue.mockResolvedValue({
      key: 'PROJ-42',
      id: '10042',
      url: 'https://test.atlassian.net/browse/PROJ-42',
    });

    const result = await handleCreateTask(
      { project_key: 'PROJ', summary: 'New task' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['issue_key']).toBe('PROJ-42');
    expect(parsed['url']).toBe('https://test.atlassian.net/browse/PROJ-42');
    expect(parsed['summary']).toBe('New task');

    // Verify fields passed to createIssue
    const fields = connector.createIssue.mock.calls[0][0] as Record<string, unknown>;
    expect(fields['project']).toEqual({ key: 'PROJ' });
    expect(fields['summary']).toBe('New task');
    expect(fields['issuetype']).toEqual({ name: 'Task' });
    expect(fields['priority']).toEqual({ name: 'Medium' });
  });

  it('creates a task with description (markdown converted to ADF)', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    connector.createIssue.mockResolvedValue({
      key: 'PROJ-43',
      id: '10043',
      url: 'https://test.atlassian.net/browse/PROJ-43',
    });

    const result = await handleCreateTask(
      {
        project_key: 'PROJ',
        summary: 'Task with description',
        description: '# Heading\n\nSome **bold** text',
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);

    // Verify description field is an ADF document (not raw markdown)
    const fields = connector.createIssue.mock.calls[0][0] as Record<string, unknown>;
    const desc = fields['description'] as Record<string, unknown>;
    expect(desc['type']).toBe('doc');
    expect(desc['version']).toBe(1);
  });

  it('creates a task with assignee (resolves email via findUser)', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    connector.findUser.mockResolvedValue('account-id-123');
    connector.createIssue.mockResolvedValue({
      key: 'PROJ-44',
      id: '10044',
      url: 'https://test.atlassian.net/browse/PROJ-44',
    });

    const result = await handleCreateTask(
      {
        project_key: 'PROJ',
        summary: 'Assigned task',
        assignee_email: 'dev@example.com',
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);

    expect(connector.findUser).toHaveBeenCalledWith('dev@example.com');
    const fields = connector.createIssue.mock.calls[0][0] as Record<string, unknown>;
    expect(fields['assignee']).toEqual({ accountId: 'account-id-123' });
  });

  it('creates a task with epic_key (discovers epic link field)', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    connector.getFields.mockResolvedValue([
      { id: 'summary', name: 'Summary', custom: false },
      { id: 'customfield_10014', name: 'Epic Link', custom: true },
    ]);
    connector.createIssue.mockResolvedValue({
      key: 'PROJ-45',
      id: '10045',
      url: 'https://test.atlassian.net/browse/PROJ-45',
    });

    const result = await handleCreateTask(
      {
        project_key: 'PROJ',
        summary: 'Epic child',
        epic_key: 'PROJ-10',
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);

    expect(connector.getFields).toHaveBeenCalled();
    const fields = connector.createIssue.mock.calls[0][0] as Record<string, unknown>;
    expect(fields['customfield_10014']).toBe('PROJ-10');
  });

  it('returns error when project_key connector lookup fails', async () => {
    const { pool, cache, taskRegistry } = setupDeps();
    pool.getConnector.mockImplementation(() => {
      throw new Error("Project 'UNKNOWN' not found in configuration");
    });

    const result = await handleCreateTask(
      { project_key: 'UNKNOWN', summary: 'Will fail' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(false);
    expect(parsed['error']).toContain('UNKNOWN');
  });

  it('returns error when createIssue throws', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    connector.createIssue.mockRejectedValue(new Error('Permission denied'));

    const result = await handleCreateTask(
      { project_key: 'PROJ', summary: 'Will fail' },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toBe('Permission denied');
  });

  it('creates a task from a task template', async () => {
    const { pool, cache, connector, taskRegistry } = setupDeps();
    const template: TaskTemplate = {
      id: 'bug-task',
      name: 'Bug Task',
      description: 'Bug template',
      summary: 'Bug: {{title}}',
      issueType: 'Bug',
      priority: 'High',
      labels: ['bug'],
      variables: [
        { name: 'title', description: 'Bug title', required: true },
        { name: 'steps', description: 'Steps', required: true },
      ],
      body: '## Steps\n{{steps}}',
      source: 'user',
      filePath: '/tmp/bug-task.md',
    };
    taskRegistry.getTemplate.mockReturnValue(template);
    connector.createIssue.mockResolvedValue({
      key: 'PROJ-46',
      id: '10046',
      url: 'https://test.atlassian.net/browse/PROJ-46',
    });

    const result = await handleCreateTask(
      {
        project_key: 'PROJ',
        summary: '',
        template_id: 'bug-task',
        variables: {
          title: 'Save button fails',
          steps: '1. Open settings\n2. Click Save',
        },
      },
      {
        pool: asPool(pool),
        cacheManager: asCacheManager(cache),
        taskTemplateRegistry: asTaskRegistry(taskRegistry),
      },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['summary']).toBe('Bug: Save button fails');
    expect((parsed['template'] as Record<string, unknown>)['template_id']).toBe('bug-task');

    const fields = connector.createIssue.mock.calls[0][0] as Record<string, unknown>;
    expect(fields['summary']).toBe('Bug: Save button fails');
    expect(fields['issuetype']).toEqual({ name: 'Bug' });
    expect(fields['priority']).toEqual({ name: 'High' });
    expect(fields['labels']).toEqual(['bug']);
    expect(fields['description']).toBeDefined();
  });
});
