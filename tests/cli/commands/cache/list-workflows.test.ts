/**
 * Tests for `jira-mcp cache list-workflows` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleListWorkflows } from '../../../../src/cli/commands/cache/list-workflows';
import type { WorkflowCacheData } from '../../../../src/cache/workflow-types';

let tempDir: string;

async function setupWorkflowCache(
  data: WorkflowCacheData,
): Promise<string> {
  const cacheDir = join(tempDir, 'cache');
  await mkdir(cacheDir, { recursive: true });
  await writeFile(
    join(cacheDir, 'workflows.json'),
    JSON.stringify(data),
  );
  return cacheDir;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-list-wf-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleListWorkflows', () => {
  it('returns workflow rows for a cached project', async () => {
    const data: WorkflowCacheData = {
      last_sync: '2026-01-01T00:00:00.000Z',
      projects: {
        PROJ: {
          issue_types: {
            Task: {
              statuses: ['To Do', 'In Progress', 'Done'],
              transitions: {},
            },
            Bug: {
              statuses: ['Open', 'Closed'],
              transitions: {},
            },
          },
        },
      },
    };
    const cacheDir = await setupWorkflowCache(data);

    const result = await handleListWorkflows(cacheDir, 'PROJ');

    expect(result.projectKey).toBe('PROJ');
    expect(result.rows).toHaveLength(2);

    const taskRow = result.rows.find((r) => r.issueType === 'Task');
    expect(taskRow?.statuses).toEqual(['To Do', 'In Progress', 'Done']);

    const bugRow = result.rows.find((r) => r.issueType === 'Bug');
    expect(bugRow?.statuses).toEqual(['Open', 'Closed']);
  });

  it('returns empty rows for unknown project', async () => {
    const data: WorkflowCacheData = {
      last_sync: '2026-01-01T00:00:00.000Z',
      projects: {},
    };
    const cacheDir = await setupWorkflowCache(data);

    const result = await handleListWorkflows(cacheDir, 'UNKNOWN');

    expect(result.projectKey).toBe('UNKNOWN');
    expect(result.rows).toHaveLength(0);
  });

  it('returns empty rows when cache file does not exist', async () => {
    const cacheDir = join(tempDir, 'empty-cache');
    await mkdir(cacheDir, { recursive: true });

    const result = await handleListWorkflows(cacheDir, 'PROJ');

    expect(result.rows).toHaveLength(0);
  });
});
