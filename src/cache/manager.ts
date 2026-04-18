/**
 * Cache manager for local task storage.
 *
 * Manages persistent JSON storage of Jira tasks with:
 *  - Zod schema validation on read and write
 *  - Atomic writes (write to .tmp then rename)
 *  - Version management
 *  - CRUD operations on cached tasks
 *
 * @module
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { TaskData, CacheData } from './types.js';
import { CacheDataSchema, CACHE_VERSION } from './types.js';
import {
  CacheNotFoundError,
  CacheCorruptionError,
  TaskNotFoundError,
} from '../errors/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitise an email address into a filesystem-safe string.
 *
 * Matches the Python MVP convention: `@` becomes `_at_`, `.` becomes `_`.
 */
import { pathExists } from '../utils/fs.js';

function sanitizeEmail(email: string): string {
  return email.replaceAll('@', '_at_').replaceAll('.', '_');
}

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

export class CacheManager {
  readonly cacheDir: string;
  readonly jiraUser: string;
  readonly cachePath: string;

  /**
   * @param cacheDir  Directory for cache files (e.g. `.local/`).
   * @param jiraUser  Jira username (email) that owns these tasks.
   */
  constructor(cacheDir: string, jiraUser: string) {
    this.cacheDir = cacheDir;
    this.jiraUser = jiraUser;
    this.cachePath = join(
      cacheDir,
      `tasks_${sanitizeEmail(jiraUser)}.json`,
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Create cache directory and initialise an empty cache file if none exists.
   *
   * Safe to call multiple times -- will not overwrite an existing cache.
   *
   * @throws {CacheCorruptionError} If an existing cache fails validation.
   */
  async initialize(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    if (await pathExists(this.cachePath)) {
      // Validate existing cache on startup
      try {
        await this.load();
      } catch (cause: unknown) {
        if (cause instanceof CacheNotFoundError) {
          // Race condition -- file removed between check and load. Just create.
        } else {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          throw new CacheCorruptionError(
            `Existing cache is corrupted: ${message}`,
          );
        }
      }
      return;
    }

    // Create empty cache
    const emptyCache: CacheData = {
      metadata: {
        version: CACHE_VERSION,
        last_sync: new Date().toISOString(),
        jira_user: this.jiraUser,
      },
      tasks: [],
    };

    await this.#atomicWrite(emptyCache);
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Load and validate the cache from disk.
   *
   * @throws {CacheNotFoundError} If the cache file does not exist.
   * @throws {CacheCorruptionError} If the file contains invalid JSON or
   *   fails Zod schema validation.
   */
  async load(): Promise<CacheData> {
    if (!(await pathExists(this.cachePath))) {
      throw new CacheNotFoundError(`Cache not found: ${this.cachePath}`);
    }

    let raw: string;
    try {
      raw = await readFile(this.cachePath, 'utf-8');
    } catch (cause: unknown) {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      throw new CacheNotFoundError(
        `Failed to read cache file: ${message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause: unknown) {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      throw new CacheCorruptionError(
        `Cache file is corrupted (invalid JSON): ${message}`,
      );
    }

    const result = CacheDataSchema.safeParse(parsed);
    if (!result.success) {
      throw new CacheCorruptionError(
        `Cache data failed validation: ${result.error.message}`,
      );
    }

    // Version check
    if (result.data.metadata.version !== CACHE_VERSION) {
      throw new CacheCorruptionError(
        `Cache version ${result.data.metadata.version} !== ${CACHE_VERSION}`,
      );
    }

    return result.data;
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /**
   * Save tasks to cache with refreshed metadata.
   *
   * Validates the payload with Zod before writing, then performs an
   * atomic write (tmp file + rename) to prevent corruption.
   *
   * @throws {CacheCorruptionError} If the data fails validation.
   */
  async save(tasks: readonly TaskData[]): Promise<void> {
    const cacheData: CacheData = {
      metadata: {
        version: CACHE_VERSION,
        last_sync: new Date().toISOString(),
        jira_user: this.jiraUser,
      },
      tasks: [...tasks],
    };

    const result = CacheDataSchema.safeParse(cacheData);
    if (!result.success) {
      throw new CacheCorruptionError(
        `Task data failed validation: ${result.error.message}`,
      );
    }

    await this.#atomicWrite(result.data);
  }

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * Get a single task by its key.
   *
   * @throws {TaskNotFoundError} If the key does not exist in the cache.
   * @throws {CacheNotFoundError} If the cache file does not exist.
   */
  async getTask(taskKey: string): Promise<TaskData> {
    const cache = await this.load();
    const task = cache.tasks.find((t) => t.key === taskKey);

    if (!task) {
      throw new TaskNotFoundError(`Task ${taskKey} not found in cache`);
    }

    return task;
  }

  /**
   * Get all cached tasks.
   *
   * @throws {CacheNotFoundError} If the cache file does not exist.
   */
  async getAllTasks(): Promise<readonly TaskData[]> {
    const cache = await this.load();
    return cache.tasks;
  }

  /**
   * Apply a partial update to a cached task.
   *
   * The `updated` timestamp is automatically set to the current time.
   *
   * @returns The updated task.
   * @throws {TaskNotFoundError} If the key does not exist in the cache.
   */
  async updateTask(
    taskKey: string,
    updates: Partial<Omit<TaskData, 'key'>>,
  ): Promise<TaskData> {
    const cache = await this.load();
    const index = cache.tasks.findIndex((t) => t.key === taskKey);

    if (index === -1) {
      throw new TaskNotFoundError(`Task ${taskKey} not found in cache`);
    }

    const existing = cache.tasks[index];
    if (!existing) {
      throw new TaskNotFoundError(`Task ${taskKey} not found in cache`);
    }

    const updated: TaskData = {
      ...existing,
      ...updates,
      key: taskKey, // key is never overwritten
      updated: new Date().toISOString(),
    };

    const newTasks = [
      ...cache.tasks.slice(0, index),
      updated,
      ...cache.tasks.slice(index + 1),
    ];

    await this.save(newTasks);
    return updated;
  }

  /**
   * Remove a task from the cache.
   *
   * @throws {TaskNotFoundError} If the key does not exist in the cache.
   */
  async deleteTask(taskKey: string): Promise<void> {
    const cache = await this.load();
    const filtered = cache.tasks.filter((t) => t.key !== taskKey);

    if (filtered.length === cache.tasks.length) {
      throw new TaskNotFoundError(`Task ${taskKey} not found in cache`);
    }

    await this.save(filtered);
  }

  /**
   * Insert a task, or replace it if the same key already exists.
   *
   * Used by mutation operations when the Jira mutation succeeded but the
   * task was not yet in the local cache (e.g. right after `create_task`,
   * or after `log_task_time` invalidated its entry). If the cache file
   * does not exist yet it is treated as an empty cache.
   *
   * @returns The stored task.
   */
  async upsertTask(task: TaskData): Promise<TaskData> {
    let existingTasks: readonly TaskData[] = [];
    try {
      const cache = await this.load();
      existingTasks = cache.tasks;
    } catch (err: unknown) {
      if (!(err instanceof CacheNotFoundError)) {
        throw err;
      }
    }

    const index = existingTasks.findIndex((t) => t.key === task.key);
    const nextTasks =
      index === -1
        ? [...existingTasks, task]
        : existingTasks.map((t, i) => (i === index ? task : t));

    await this.save(nextTasks);
    return task;
  }

  /**
   * Get cache metadata (version, last_sync, jira_user).
   *
   * @throws {CacheNotFoundError} If the cache file does not exist.
   */
  async getMetadata(): Promise<CacheData['metadata']> {
    const cache = await this.load();
    return cache.metadata;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Atomic write: serialise to a temporary file then rename into place.
   *
   * This prevents readers from seeing a half-written file if the process
   * is interrupted mid-write.
   */
  async #atomicWrite(data: CacheData): Promise<void> {
    const tmpPath = `${this.cachePath}.tmp`;
    const json = JSON.stringify(data, null, 2);

    await writeFile(tmpPath, json, { encoding: 'utf-8', mode: 0o600 });
    await rename(tmpPath, this.cachePath);
  }
}
