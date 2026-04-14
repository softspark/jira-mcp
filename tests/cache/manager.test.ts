/**
 * Tests for the CacheManager.
 *
 * Uses real filesystem with temp directories for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CacheManager } from '../../src/cache/manager';
import {
  CacheNotFoundError,
  CacheCorruptionError,
  TaskNotFoundError,
} from '../../src/errors/index';
import { createTaskData } from '../fixtures/tasks';

const TEST_USER = 'test@example.com';

let tempDir: string;
let manager: CacheManager;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-cache-test-'));
  manager = new CacheManager(tempDir, TEST_USER);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('CacheManager.initialize', () => {
  it('creates cache directory and empty cache file', async () => {
    await manager.initialize();

    // File should exist after init
    await expect(access(manager.cachePath)).resolves.toBeUndefined();

    // Should load as valid empty cache
    const data = await manager.load();
    expect(data.tasks).toEqual([]);
    expect(data.metadata.jira_user).toBe(TEST_USER);
  });

  it('does not overwrite existing valid cache', async () => {
    await manager.initialize();
    const task = createTaskData({ key: 'PROJ-1' });
    await manager.save([task]);

    // Re-initialize should preserve data
    await manager.initialize();
    const data = await manager.load();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0]?.key).toBe('PROJ-1');
  });

  it('throws CacheCorruptionError for corrupted existing cache', async () => {
    // Manually write corrupted data
    const { mkdir } = await import('node:fs/promises');
    await mkdir(tempDir, { recursive: true });
    await writeFile(manager.cachePath, '{corrupt json!!!', 'utf-8');

    await expect(manager.initialize()).rejects.toThrow(CacheCorruptionError);
  });

  it('creates nested directories with recursive option', async () => {
    const nestedDir = join(tempDir, 'a', 'b', 'c');
    const nestedManager = new CacheManager(nestedDir, TEST_USER);

    await nestedManager.initialize();
    await expect(access(nestedManager.cachePath)).resolves.toBeUndefined();
  });
});

describe('CacheManager.save and load', () => {
  beforeEach(async () => {
    await manager.initialize();
  });

  it('roundtrips tasks through save/load', async () => {
    const tasks = [
      createTaskData({ key: 'PROJ-1', summary: 'First' }),
      createTaskData({ key: 'PROJ-2', summary: 'Second' }),
    ];

    await manager.save(tasks);
    const loaded = await manager.load();

    expect(loaded.tasks).toHaveLength(2);
    expect(loaded.tasks[0]?.key).toBe('PROJ-1');
    expect(loaded.tasks[1]?.key).toBe('PROJ-2');
  });

  it('atomic write cleans up .tmp file', async () => {
    const tasks = [createTaskData()];
    await manager.save(tasks);

    // .tmp file should not exist after successful save
    const tmpPath = `${manager.cachePath}.tmp`;
    await expect(access(tmpPath)).rejects.toThrow();
  });

  it('updates metadata on save', async () => {
    const tasks = [createTaskData()];
    await manager.save(tasks);

    const data = await manager.load();
    expect(data.metadata.jira_user).toBe(TEST_USER);
    expect(data.metadata.version).toBe('1.0');
  });

  it('throws CacheCorruptionError for invalid task data on save', async () => {
    // Create task missing required fields by casting
    const badTask = { key: 'PROJ-1' } as ReturnType<typeof createTaskData>;

    await expect(manager.save([badTask])).rejects.toThrow(
      CacheCorruptionError,
    );
  });
});

describe('CacheManager.load error handling', () => {
  it('throws CacheNotFoundError when cache file does not exist', async () => {
    // Don't call initialize, so there's no cache file
    await expect(manager.load()).rejects.toThrow(CacheNotFoundError);
  });

  it('throws CacheCorruptionError for invalid JSON', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(tempDir, { recursive: true });
    await writeFile(manager.cachePath, '{{not json}}', 'utf-8');

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });

  it('throws CacheCorruptionError for valid JSON with wrong schema', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      manager.cachePath,
      JSON.stringify({ some: 'data' }),
      'utf-8',
    );

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });

  it('throws CacheCorruptionError for mismatched version', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(tempDir, { recursive: true });
    const badVersionData = {
      metadata: {
        version: '99.0',
        last_sync: '2026-01-01T00:00:00.000Z',
        jira_user: TEST_USER,
      },
      tasks: [],
    };
    await writeFile(
      manager.cachePath,
      JSON.stringify(badVersionData),
      'utf-8',
    );

    await expect(manager.load()).rejects.toThrow(CacheCorruptionError);
  });
});

describe('CacheManager.getTask', () => {
  beforeEach(async () => {
    await manager.initialize();
    await manager.save([
      createTaskData({ key: 'PROJ-1', summary: 'First' }),
      createTaskData({ key: 'PROJ-2', summary: 'Second' }),
    ]);
  });

  it('returns existing task by key', async () => {
    const task = await manager.getTask('PROJ-1');
    expect(task.key).toBe('PROJ-1');
    expect(task.summary).toBe('First');
  });

  it('throws TaskNotFoundError for missing key', async () => {
    await expect(manager.getTask('NONEXISTENT')).rejects.toThrow(
      TaskNotFoundError,
    );
  });
});

describe('CacheManager.getAllTasks', () => {
  beforeEach(async () => {
    await manager.initialize();
  });

  it('returns all cached tasks', async () => {
    await manager.save([
      createTaskData({ key: 'PROJ-1' }),
      createTaskData({ key: 'PROJ-2' }),
      createTaskData({ key: 'PROJ-3' }),
    ]);

    const all = await manager.getAllTasks();
    expect(all).toHaveLength(3);
  });

  it('returns empty array for initialized cache with no tasks', async () => {
    const all = await manager.getAllTasks();
    expect(all).toEqual([]);
  });
});

describe('CacheManager.updateTask', () => {
  beforeEach(async () => {
    await manager.initialize();
    await manager.save([
      createTaskData({ key: 'PROJ-1', status: 'To Do' }),
    ]);
  });

  it('merges partial updates into existing task', async () => {
    const updated = await manager.updateTask('PROJ-1', {
      status: 'In Progress',
    });

    expect(updated.key).toBe('PROJ-1');
    expect(updated.status).toBe('In Progress');
    // Summary should be preserved
    expect(updated.summary).toBe('Test task summary');
  });

  it('sets updated timestamp automatically', async () => {
    const before = new Date().toISOString();
    const updated = await manager.updateTask('PROJ-1', {
      status: 'Done',
    });
    const after = new Date().toISOString();

    expect(updated.updated >= before).toBe(true);
    expect(updated.updated <= after).toBe(true);
  });

  it('persists updates to disk', async () => {
    await manager.updateTask('PROJ-1', { status: 'Done' });

    // Reload from disk
    const loaded = await manager.load();
    expect(loaded.tasks[0]?.status).toBe('Done');
  });

  it('throws TaskNotFoundError for missing task key', async () => {
    await expect(
      manager.updateTask('MISSING', { status: 'Done' }),
    ).rejects.toThrow(TaskNotFoundError);
  });
});

describe('CacheManager.deleteTask', () => {
  beforeEach(async () => {
    await manager.initialize();
    await manager.save([
      createTaskData({ key: 'PROJ-1' }),
      createTaskData({ key: 'PROJ-2' }),
    ]);
  });

  it('removes task from cache', async () => {
    await manager.deleteTask('PROJ-1');

    const all = await manager.getAllTasks();
    expect(all).toHaveLength(1);
    expect(all[0]?.key).toBe('PROJ-2');
  });

  it('throws TaskNotFoundError for non-existent key', async () => {
    await expect(manager.deleteTask('MISSING')).rejects.toThrow(
      TaskNotFoundError,
    );
  });
});

describe('CacheManager cache path', () => {
  it('sanitizes email in filename (@ -> _at_, . -> _)', () => {
    const m = new CacheManager('/tmp', 'user@example.com');
    expect(m.cachePath).toBe('/tmp/tasks_user_at_example_com.json');
  });
});
