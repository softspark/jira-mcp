/**
 * Tests for the search_tasks tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleSearchTasks } from '../../src/tools/search-tasks';
import {
  createMockInstancePool,
  createMockConnector,
  asPool,
} from '../fixtures/mocks';
import type { JiraConfig } from '../../src/config/types';

function parseResult(
  result: { content: Array<{ type: string; text?: string }> },
): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

function createMockConfig(defaultProject = 'DEFAULT'): JiraConfig {
  return {
    projects: {
      DEFAULT: {
        url: 'https://default.atlassian.net',
        username: 'user@example.com',
        api_token: 'token-default',
      },
      OTHER: {
        url: 'https://other.atlassian.net',
        username: 'user@example.com',
        api_token: 'token-other',
      },
    },
    default_project: defaultProject,
    credentials: {
      username: 'user@example.com',
      api_token: 'token-default',
    },
  };
}

describe('handleSearchTasks', () => {
  function setupDeps(defaultProject = 'DEFAULT') {
    const pool = createMockInstancePool();
    const connector = createMockConnector();
    const config = createMockConfig(defaultProject);
    pool.getConnector.mockReturnValue(connector);
    return { pool, connector, config };
  }

  it('returns search results', async () => {
    const { pool, connector, config } = setupDeps();
    connector.searchIssues.mockResolvedValue([
      {
        key: 'PROJ-1',
        summary: 'First issue',
        status: 'To Do',
        assignee: 'dev@example.com',
        priority: 'High',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-02T00:00:00.000Z',
        projectKey: 'PROJ',
        epicLink: null,
      },
      {
        key: 'PROJ-2',
        summary: 'Second issue',
        status: 'In Progress',
        assignee: null,
        priority: 'Medium',
        issueType: 'Bug',
        created: '2026-01-03T00:00:00.000Z',
        updated: '2026-01-04T00:00:00.000Z',
        projectKey: 'PROJ',
        epicLink: null,
      },
    ]);

    const result = await handleSearchTasks(
      { jql: 'project = PROJ', project_key: 'PROJ' },
      { pool: asPool(pool), config },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(2);
    expect(parsed['total_available']).toBe(2);
    const results = parsed['results'] as unknown[];
    expect(results).toHaveLength(2);
  });

  it('uses project_key to select the correct instance', async () => {
    const { pool, connector, config } = setupDeps();
    connector.searchIssues.mockResolvedValue([]);

    await handleSearchTasks(
      { jql: 'status = Done', project_key: 'OTHER' },
      { pool: asPool(pool), config },
    );

    expect(pool.getConnector).toHaveBeenCalledWith('OTHER');
  });

  it('defaults to default project when no project_key provided', async () => {
    const { pool, connector, config } = setupDeps('DEFAULT');
    connector.searchIssues.mockResolvedValue([]);

    await handleSearchTasks(
      { jql: 'status = "To Do"' },
      { pool: asPool(pool), config },
    );

    expect(pool.getConnector).toHaveBeenCalledWith('DEFAULT');
  });

  it('handles empty results', async () => {
    const { pool, connector, config } = setupDeps();
    connector.searchIssues.mockResolvedValue([]);

    const result = await handleSearchTasks(
      { jql: 'project = EMPTY', project_key: 'PROJ' },
      { pool: asPool(pool), config },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(0);
    expect(parsed['results']).toEqual([]);
  });

  it('returns failure on error', async () => {
    const { pool, connector, config } = setupDeps();
    connector.searchIssues.mockRejectedValue(new Error('Invalid JQL'));

    const result = await handleSearchTasks(
      { jql: 'bad jql', project_key: 'PROJ' },
      { pool: asPool(pool), config },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(false);
    expect(parsed['error']).toBe('Invalid JQL');
  });
});
