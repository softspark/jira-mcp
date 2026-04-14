/**
 * Workflow cache manager.
 *
 * Persists project workflow data (statuses per issue type) so that
 * status validation can happen offline without hitting the Jira API.
 *
 * Uses atomic writes (tmp + rename) to prevent corruption.
 *
 * @module
 */

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { JiraConnector } from '../connector/jira-connector.js';
import type { InstancePool } from '../connector/instance-pool.js';
import type { JiraConfig } from '../config/types.js';
import type {
  WorkflowCacheData,
  ProjectWorkflow,
  IssueTypeWorkflow,
} from './workflow-types.js';
import { WorkflowCacheDataSchema } from './workflow-types.js';
import { GLOBAL_WORKFLOWS_PATH } from '../config/paths.js';
import { CacheCorruptionError, CacheNotFoundError } from '../errors/index.js';
import { pathExists } from '../utils/fs.js';

// ---------------------------------------------------------------------------
// WorkflowCacheManager
// ---------------------------------------------------------------------------

export class WorkflowCacheManager {
  private readonly cachePath: string;
  private data: WorkflowCacheData | null = null;

  constructor(cachePath?: string) {
    this.cachePath = cachePath ?? GLOBAL_WORKFLOWS_PATH;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  /**
   * Load the workflow cache from disk.
   *
   * Returns `null` if the file does not exist (first run).
   *
   * @throws {CacheCorruptionError} If the file contains invalid data.
   */
  async load(): Promise<WorkflowCacheData | null> {
    if (!(await pathExists(this.cachePath))) {
      return null;
    }

    let raw: string;
    try {
      raw = await readFile(this.cachePath, 'utf-8');
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CacheNotFoundError(
        `Failed to read workflow cache: ${message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CacheCorruptionError(
        `Workflow cache is corrupted (invalid JSON): ${message}`,
      );
    }

    const result = WorkflowCacheDataSchema.safeParse(parsed);
    if (!result.success) {
      throw new CacheCorruptionError(
        `Workflow cache failed validation: ${result.error.message}`,
      );
    }

    this.data = result.data;
    return result.data;
  }

  /**
   * Save workflow cache data to disk with atomic write.
   *
   * Validates the payload with Zod before writing, then performs
   * a tmp+rename to prevent corruption.
   *
   * @throws {CacheCorruptionError} If the data fails validation.
   */
  async save(data: WorkflowCacheData): Promise<void> {
    const result = WorkflowCacheDataSchema.safeParse(data);
    if (!result.success) {
      throw new CacheCorruptionError(
        `Workflow data failed validation: ${result.error.message}`,
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
   * Sync workflow data for a single project from the Jira API.
   *
   * Fetches all statuses grouped by issue type and merges them
   * into the existing cache.
   */
  async syncProject(
    projectKey: string,
    connector: JiraConnector,
  ): Promise<void> {
    const issueTypeStatuses = await connector.getProjectStatuses(projectKey);

    const issueTypes: Record<string, IssueTypeWorkflow> = {};

    for (const issueType of issueTypeStatuses) {
      issueTypes[issueType.name] = {
        statuses: issueType.statuses.map((s) => s.name),
        transitions: {}, // Populated on first query per issue
      };
    }

    const projectWorkflow: ProjectWorkflow = { issue_types: issueTypes };

    // Merge into existing data
    const existing = this.data ?? {
      last_sync: new Date().toISOString(),
      projects: {},
    };

    const updated: WorkflowCacheData = {
      last_sync: new Date().toISOString(),
      projects: {
        ...existing.projects,
        [projectKey]: projectWorkflow,
      },
    };

    await this.save(updated);
  }

  /**
   * Sync workflow data for all configured projects.
   *
   * Iterates over every project key in the configuration and fetches
   * statuses from the appropriate Jira instance.
   *
   * @returns Number of projects synced.
   */
  async syncAll(pool: InstancePool, config: JiraConfig): Promise<number> {
    // Load existing data first so incremental merges work
    await this.load();

    const projectKeys = Object.keys(config.projects);
    let count = 0;

    for (const projectKey of projectKeys) {
      const connector = pool.getConnector(projectKey);
      await this.syncProject(projectKey, connector);
      count++;
    }

    return count;
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /**
   * Get workflow data for a specific project.
   *
   * Returns `null` if the project is not in the cache.
   * Must call `load()` before this method.
   */
  getProjectWorkflow(projectKey: string): ProjectWorkflow | null {
    if (!this.data) {
      return null;
    }
    return this.data.projects[projectKey] ?? null;
  }
}
