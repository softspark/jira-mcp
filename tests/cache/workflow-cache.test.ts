/**
 * Tests for the WorkflowCacheManager.
 *
 * Uses real filesystem with temp directories for isolation.
 * Mocked JiraConnector for sync operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { WorkflowCacheManager } from '../../src/cache/workflow-cache';
import { CacheCorruptionError } from '../../src/errors/index';
import {
  createMockConnector,
  createMockInstancePool,
  asConnector,
  asPool,
} from '../fixtures/mocks';
import type { WorkflowCacheData } from '../../src/cache/workflow-types';
import type { ProjectIssueTypeStatus } from '../../src/connector/types';

let tempDir: string;
let cachePath: string;
let manager: WorkflowCacheManager;

function createValidCacheData(
  overrides?: Partial<WorkflowCacheData>,
): WorkflowCacheData {
  return {
    last_sync: '2026-01-01T00:00:00.000Z',
    projects: {},
    ...overrides,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-workflow-'));
  cachePath = join(tempDir, 'workflows.json');
  manager = new WorkflowCacheManager(cachePath);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('WorkflowCacheManager.load', () => {
  it('returns null when cache file does not exist', async () => {
    const result = await manager.load();
    expect(result).toBeNull();
  });

  it('loads valid cache data from disk', async () => {
    const data = createValidCacheData({
      projects: {
        PROJ: {
          issue_types: {
            Task: {
              statuses: ['To Do', 'In Progress', 'Done'],
              transitions: {},
            },
          },
        },
      },
    });
    await writeFile(cachePath, JSON.stringify(data), 'utf-8');

    const result = await manager.load();

    expect(result).not.toBeNull();
    expect(result?.projects['PROJ']?.issue_types['Task']?.statuses).toEqual([
      'To Do',
      'In Progress',
      'Done',
    ]);
  });

  it('throws CacheCorruptionError for invalid JSON', async () => {
    await writeFile(cachePath, '{not valid json!!!', 'utf-8');

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });

  it('throws CacheCorruptionError for invalid schema', async () => {
    await writeFile(
      cachePath,
      JSON.stringify({ wrong: 'shape' }),
      'utf-8',
    );

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });
});

describe('WorkflowCacheManager.save', () => {
  it('roundtrips data through save and load', async () => {
    const data = createValidCacheData({
      projects: {
        PROJ: {
          issue_types: {
            Bug: {
              statuses: ['Open', 'Closed'],
              transitions: {},
            },
          },
        },
      },
    });

    await manager.save(data);
    const loaded = await manager.load();

    expect(loaded).toEqual(data);
  });

  it('performs atomic write (no .tmp file after success)', async () => {
    const data = createValidCacheData();
    await manager.save(data);

    const tmpPath = `${cachePath}.tmp`;
    await expect(access(tmpPath)).rejects.toThrow();
  });

  it('creates parent directories if missing', async () => {
    const nestedPath = join(tempDir, 'a', 'b', 'workflows.json');
    const nestedManager = new WorkflowCacheManager(nestedPath);

    await nestedManager.save(createValidCacheData());
    const loaded = await nestedManager.load();

    expect(loaded).not.toBeNull();
  });

  it('throws CacheCorruptionError for invalid data', async () => {
    const badData = { wrong: 'shape' } as unknown as WorkflowCacheData;

    await expect(manager.save(badData)).rejects.toThrow(
      CacheCorruptionError,
    );
  });
});

describe('WorkflowCacheManager.syncProject', () => {
  it('maps statuses from connector response correctly', async () => {
    const mockConnector = createMockConnector();
    const apiResponse: ProjectIssueTypeStatus[] = [
      {
        id: '1',
        name: 'Task',
        statuses: [
          { name: 'To Do', id: '10' },
          { name: 'In Progress', id: '20' },
          { name: 'Done', id: '30' },
        ],
      },
      {
        id: '2',
        name: 'Bug',
        statuses: [
          { name: 'Open', id: '10' },
          { name: 'Closed', id: '30' },
        ],
      },
    ];
    mockConnector.getProjectStatuses.mockResolvedValue(apiResponse);

    await manager.syncProject('PROJ', asConnector(mockConnector));

    const workflow = manager.getProjectWorkflow('PROJ');
    expect(workflow).not.toBeNull();
    expect(workflow?.issue_types['Task']?.statuses).toEqual([
      'To Do',
      'In Progress',
      'Done',
    ]);
    expect(workflow?.issue_types['Bug']?.statuses).toEqual([
      'Open',
      'Closed',
    ]);
    // Transitions start empty (populated on first query)
    expect(workflow?.issue_types['Task']?.transitions).toEqual({});
  });

  it('merges new project data with existing cache', async () => {
    // Pre-populate with project A
    const existing = createValidCacheData({
      projects: {
        PROJ_A: {
          issue_types: {
            Task: { statuses: ['Open'], transitions: {} },
          },
        },
      },
    });
    await manager.save(existing);
    await manager.load();

    // Sync project B
    const mockConnector = createMockConnector();
    mockConnector.getProjectStatuses.mockResolvedValue([
      {
        id: '1',
        name: 'Story',
        statuses: [{ name: 'Backlog', id: '1' }],
      },
    ]);

    await manager.syncProject('PROJ_B', asConnector(mockConnector));

    // Both projects should exist
    expect(manager.getProjectWorkflow('PROJ_A')).not.toBeNull();
    expect(manager.getProjectWorkflow('PROJ_B')).not.toBeNull();
  });
});

describe('WorkflowCacheManager.syncAll', () => {
  it('syncs all projects from config', async () => {
    const mockConnector = createMockConnector();
    mockConnector.getProjectStatuses.mockResolvedValue([
      {
        id: '1',
        name: 'Task',
        statuses: [{ name: 'To Do', id: '10' }],
      },
    ]);

    const mockPool = createMockInstancePool();
    mockPool.getConnector.mockReturnValue(asConnector(mockConnector));

    const config = {
      projects: {
        PROJ_A: {
          url: 'https://a.atlassian.net',
          username: 'user@test.com',
          api_token: 'token',
        },
        PROJ_B: {
          url: 'https://a.atlassian.net',
          username: 'user@test.com',
          api_token: 'token',
        },
      },
      default_project: 'PROJ_A',
      credentials: { username: 'user@test.com', api_token: 'token' },
    };

    const count = await manager.syncAll(asPool(mockPool), config);

    expect(count).toBe(2);
    expect(mockConnector.getProjectStatuses).toHaveBeenCalledTimes(2);
  });
});

describe('WorkflowCacheManager.getProjectWorkflow', () => {
  it('returns null for unknown project', async () => {
    const data = createValidCacheData({ projects: {} });
    await manager.save(data);
    await manager.load();

    expect(manager.getProjectWorkflow('UNKNOWN')).toBeNull();
  });

  it('returns null when data has not been loaded', () => {
    expect(manager.getProjectWorkflow('PROJ')).toBeNull();
  });
});
