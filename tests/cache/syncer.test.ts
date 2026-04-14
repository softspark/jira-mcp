/**
 * Tests for the TaskSyncer.
 */

import { describe, it, expect, vi } from 'vitest';

import { TaskSyncer } from '../../src/cache/syncer';
import type { JiraFetcher, JiraIssue } from '../../src/cache/syncer';
import { createMockCacheManager, asCacheManager } from '../fixtures/mocks';
import { createMergedConfig, createInstanceConfig } from '../fixtures/config';

function createJiraIssue(overrides?: Partial<JiraIssue>): JiraIssue {
  return {
    key: 'PROJ-1',
    fields: {
      summary: 'Test issue',
      status: { name: 'To Do' },
      assignee: { emailAddress: 'user@example.com' },
      priority: { name: 'Medium' },
      issuetype: { name: 'Task' },
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      project: { key: 'PROJ' },
      customfield_10014: null,
    },
    ...overrides,
  };
}

function createMockFetcher(
  issues: JiraIssue[] = [],
  instanceUrl = 'https://test.atlassian.net',
): JiraFetcher {
  return {
    searchIssues: vi.fn().mockResolvedValue(issues),
    instanceUrl,
  };
}

describe('TaskSyncer', () => {
  it('syncs tasks from a single instance and saves to cache', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const config = createMergedConfig();
    const issues = [
      createJiraIssue({ key: 'PROJ-1' }),
      createJiraIssue({ key: 'PROJ-2' }),
    ];

    const fetcher = createMockFetcher(issues);
    const fetcherFactory = vi.fn().mockReturnValue(fetcher);

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    const count = await syncer.sync();

    expect(count).toBe(2);
    expect(cache.save).toHaveBeenCalledTimes(1);
    const savedTasks = cache.save.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(savedTasks).toHaveLength(2);
    expect(savedTasks[0]!['key']).toBe('PROJ-1');
    expect(savedTasks[0]!['project_key']).toBe('PROJ');
  });

  it('maps Jira issue fields to TaskData format correctly', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const issue = createJiraIssue({
      key: 'ABC-42',
      fields: {
        summary: 'Custom summary',
        status: { name: 'In Progress' },
        assignee: null,
        priority: null,
        issuetype: { name: 'Bug' },
        created: '2026-06-15T10:00:00.000Z',
        updated: '2026-06-16T12:00:00.000Z',
        project: { key: 'ABC' },
        customfield_10014: 'EPIC-1',
      },
    });

    const fetcher = createMockFetcher([issue]);
    const fetcherFactory = vi.fn().mockReturnValue(fetcher);
    const config = createMergedConfig();

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    await syncer.sync();

    const savedTasks = cache.save.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const task = savedTasks[0]!;
    expect(task['key']).toBe('ABC-42');
    expect(task['summary']).toBe('Custom summary');
    expect(task['status']).toBe('In Progress');
    expect(task['assignee']).toBeNull();
    expect(task['priority']).toBe('None');
    expect(task['issue_type']).toBe('Bug');
    expect(task['epic_link']).toBe('EPIC-1');
    expect(task['project_url']).toBe('https://test.atlassian.net');
  });

  it('handles empty results from fetcher', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const fetcher = createMockFetcher([]);
    const fetcherFactory = vi.fn().mockReturnValue(fetcher);
    const config = createMergedConfig();

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    const count = await syncer.sync();

    expect(count).toBe(0);
    const savedTasks = cache.save.mock.calls[0]![0] as Array<unknown>;
    expect(savedTasks).toHaveLength(0);
  });

  it('syncs from multiple unique instances', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const config = createMergedConfig({
      projects: {
        PROJ0: createInstanceConfig({ url: 'https://a.atlassian.net' }),
        PROJ1: createInstanceConfig({ url: 'https://b.atlassian.net' }),
      },
    });

    const fetcherA = createMockFetcher(
      [createJiraIssue({ key: 'PROJ0-1' })],
      'https://a.atlassian.net',
    );
    const fetcherB = createMockFetcher(
      [createJiraIssue({ key: 'PROJ1-1' })],
      'https://b.atlassian.net',
    );

    const fetcherFactory = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://a.atlassian.net') return fetcherA;
      return fetcherB;
    });

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    const count = await syncer.sync();

    expect(count).toBe(2);
    expect(fetcherFactory).toHaveBeenCalledTimes(2);
  });

  it('uses provided JQL when specified', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const fetcher = createMockFetcher([]);
    const fetcherFactory = vi.fn().mockReturnValue(fetcher);
    const config = createMergedConfig();

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    await syncer.sync({ jql: 'project = PROJ ORDER BY created DESC' });

    expect(fetcher.searchIssues).toHaveBeenCalledWith(
      'project = PROJ ORDER BY created DESC',
    );
  });

  it('uses default JQL when none is provided', async () => {
    const cache = createMockCacheManager();
    cache.save.mockResolvedValue(undefined);

    const fetcher = createMockFetcher([]);
    const fetcherFactory = vi.fn().mockReturnValue(fetcher);
    const config = createMergedConfig();

    const syncer = new TaskSyncer(asCacheManager(cache), config, fetcherFactory);
    await syncer.sync();

    expect(fetcher.searchIssues).toHaveBeenCalledWith(
      expect.stringContaining('assignee'),
    );
  });
});
