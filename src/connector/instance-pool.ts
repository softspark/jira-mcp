/**
 * Pool of JiraConnector instances keyed by Jira URL.
 *
 * Multiple project keys may map to the same Jira instance URL. This pool
 * deduplicates connectors so each unique instance is only created once.
 *
 * @module
 */

import type { JiraConfig } from '../config/types.js';
import { ConfigValidationError } from '../errors/index.js';
import { JiraConnector } from './jira-connector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata about a single Jira instance in the pool. */
export interface PooledInstance {
  readonly connector: JiraConnector;
  readonly projectKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// InstancePool
// ---------------------------------------------------------------------------

export class InstancePool {
  /** Connectors keyed by project key for fast lookup. */
  private readonly byProject = new Map<string, JiraConnector>();
  /** Deduplicated instances keyed by URL. */
  private readonly byUrl = new Map<string, PooledInstance>();
  private readonly config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    this.#buildPool();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get the connector for a specific project key.
   *
   * @throws {ConfigValidationError} If the project key is not configured.
   */
  getConnector(projectKey: string): JiraConnector {
    const connector = this.byProject.get(projectKey);
    if (!connector) {
      throw new ConfigValidationError(
        `Project '${projectKey}' not found in configuration`,
      );
    }
    return connector;
  }

  /**
   * Get the connector for a task key by extracting the project prefix.
   *
   * @example getConnectorForTask("PROJ-123") // returns connector for "PROJ"
   * @throws {ConfigValidationError} If the extracted project key is not configured.
   */
  getConnectorForTask(taskKey: string): JiraConnector {
    const projectKey = taskKey.split('-')[0];
    if (!projectKey) {
      throw new ConfigValidationError(
        `Invalid task key format: '${taskKey}'. Expected 'PROJECT-NUMBER'.`,
      );
    }
    return this.getConnector(projectKey);
  }

  /**
   * Get all unique instances with their associated project keys.
   *
   * Useful for multi-instance sync where each unique URL should be
   * queried only once.
   */
  getInstances(): ReadonlyMap<string, PooledInstance> {
    return this.byUrl;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Build the connector pool by deduplicating on instance URL.
   *
   * Projects sharing the same URL will share a single Version3Client.
   */
  #buildPool(): void {
    // Group project keys by URL
    const urlToKeys = new Map<string, string[]>();

    for (const [key, instance] of Object.entries(this.config.projects)) {
      const existing = urlToKeys.get(instance.url);
      if (existing) {
        existing.push(key);
      } else {
        urlToKeys.set(instance.url, [key]);
      }
    }

    // Create one connector per unique URL
    for (const [url, keys] of urlToKeys) {
      const firstKey = keys[0];
      if (!firstKey) continue;

      const instanceConfig = this.config.projects[firstKey];
      if (!instanceConfig) continue;

      const connector = new JiraConnector(instanceConfig);
      const pooled: PooledInstance = { connector, projectKeys: keys };

      this.byUrl.set(url, pooled);

      // Map every project key to the shared connector
      for (const key of keys) {
        this.byProject.set(key, connector);
      }
    }
  }
}
