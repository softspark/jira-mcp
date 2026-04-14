/**
 * User cache manager.
 *
 * Persists Jira user data per instance for offline lookups such as
 * resolving an email address to a Jira account ID.
 *
 * Uses atomic writes (tmp + rename) to prevent corruption.
 *
 * @module
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { JiraConnector } from '../connector/jira-connector.js';
import type { InstancePool } from '../connector/instance-pool.js';
import type { UserCacheData, CachedUser } from './user-types.js';
import { UserCacheDataSchema } from './user-types.js';
import { GLOBAL_USERS_PATH } from '../config/paths.js';
import { CacheCorruptionError, CacheNotFoundError } from '../errors/index.js';
import { pathExists } from '../utils/fs.js';

// ---------------------------------------------------------------------------
// UserCacheManager
// ---------------------------------------------------------------------------

export class UserCacheManager {
  private readonly cachePath: string;
  private data: UserCacheData | null = null;

  constructor(cachePath?: string) {
    this.cachePath = cachePath ?? GLOBAL_USERS_PATH;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  /**
   * Load the user cache from disk.
   *
   * Returns `null` if the file does not exist (first run).
   *
   * @throws {CacheCorruptionError} If the file contains invalid data.
   */
  async load(): Promise<UserCacheData | null> {
    if (!(await pathExists(this.cachePath))) {
      return null;
    }

    let raw: string;
    try {
      raw = await readFile(this.cachePath, 'utf-8');
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CacheNotFoundError(
        `Failed to read user cache: ${message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CacheCorruptionError(
        `User cache is corrupted (invalid JSON): ${message}`,
      );
    }

    const result = UserCacheDataSchema.safeParse(parsed);
    if (!result.success) {
      throw new CacheCorruptionError(
        `User cache failed validation: ${result.error.message}`,
      );
    }

    this.data = result.data;
    return result.data;
  }

  /**
   * Save user cache data to disk with atomic write.
   *
   * Validates the payload with Zod before writing, then performs
   * a tmp+rename to prevent corruption.
   *
   * @throws {CacheCorruptionError} If the data fails validation.
   */
  async save(data: UserCacheData): Promise<void> {
    const result = UserCacheDataSchema.safeParse(data);
    if (!result.success) {
      throw new CacheCorruptionError(
        `User data failed validation: ${result.error.message}`,
      );
    }

    await mkdir(dirname(this.cachePath), { recursive: true });

    const tmpPath = `${this.cachePath}.tmp`;
    const json = JSON.stringify(result.data, null, 2);

    await writeFile(tmpPath, json, { encoding: 'utf-8', mode: 0o600 });
    await rename(tmpPath, this.cachePath);

    this.data = result.data;
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  /**
   * Sync users from a single Jira instance.
   *
   * Searches for all users (empty query) and stores them under
   * the instance URL key.
   *
   * @returns Number of users synced for this instance.
   */
  async syncInstance(
    instanceUrl: string,
    connector: JiraConnector,
  ): Promise<number> {
    const jiraUsers = await connector.searchUsers('', 1000);

    const cachedUsers: CachedUser[] = jiraUsers.map((u) => ({
      account_id: u.accountId,
      email: u.emailAddress,
      display_name: u.displayName,
      active: u.active,
    }));

    // Merge into existing data
    const existing = this.data ?? {
      last_sync: new Date().toISOString(),
      instances: {},
    };

    const updated: UserCacheData = {
      last_sync: new Date().toISOString(),
      instances: {
        ...existing.instances,
        [instanceUrl]: { users: cachedUsers },
      },
    };

    await this.save(updated);

    return cachedUsers.length;
  }

  /**
   * Sync users from all unique Jira instances in the pool.
   *
   * Each unique URL is queried only once (deduplication via InstancePool).
   *
   * @returns Total number of users synced across all instances.
   */
  async syncAll(pool: InstancePool): Promise<number> {
    // Load existing data first so incremental merges work
    await this.load();

    let total = 0;
    const instances = pool.getInstances();

    for (const [url, pooled] of instances) {
      const count = await this.syncInstance(url, pooled.connector);
      total += count;
    }

    return total;
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Resolve an email address to a Jira account ID.
   *
   * Searches the specified instance's user list for a matching email.
   * Returns `null` if no match is found.
   *
   * Must call `load()` before this method.
   */
  resolveEmail(instanceUrl: string, email: string): string | null {
    if (!this.data) {
      return null;
    }

    const instance = this.data.instances[instanceUrl];
    if (!instance) {
      return null;
    }

    const lowerEmail = email.toLowerCase();
    const user = instance.users.find(
      (u) => u.email?.toLowerCase() === lowerEmail,
    );

    return user?.account_id ?? null;
  }

  /**
   * Get all cached users across all instances, deduplicated by account ID.
   *
   * Must call `load()` before this method.
   */
  getAllUsers(): CachedUser[] {
    if (!this.data) {
      return [];
    }

    const seen = new Set<string>();
    const result: CachedUser[] = [];

    for (const instance of Object.values(this.data.instances)) {
      for (const user of instance.users) {
        if (!seen.has(user.account_id)) {
          seen.add(user.account_id);
          result.push(user);
        }
      }
    }

    return result;
  }
}
