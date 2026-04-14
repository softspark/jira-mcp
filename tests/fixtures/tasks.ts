/**
 * Factory functions for task and cache test data.
 */

import type { TaskData, CacheData } from '../../src/cache/types';
import { CACHE_VERSION } from '../../src/cache/types';

export function createTaskData(overrides?: Partial<TaskData>): TaskData {
  return {
    key: 'PROJ-1',
    summary: 'Test task summary',
    status: 'To Do',
    assignee: 'user@example.com',
    priority: 'Medium',
    issue_type: 'Task',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    project_key: 'PROJ',
    project_url: 'https://test.atlassian.net',
    epic_link: null,
    ...overrides,
  };
}

export function createCacheData(taskCount = 2): CacheData {
  const tasks: TaskData[] = [];
  for (let i = 0; i < taskCount; i++) {
    tasks.push(
      createTaskData({
        key: `PROJ-${i + 1}`,
        summary: `Task ${i + 1}`,
      }),
    );
  }

  return {
    metadata: {
      version: CACHE_VERSION,
      last_sync: '2026-01-01T00:00:00.000Z',
      jira_user: 'user@example.com',
    },
    tasks,
  };
}
