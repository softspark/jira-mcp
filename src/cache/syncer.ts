/**
 * Task syncer -- fetches issues from Jira and writes them to the local cache.
 *
 * The actual Jira API call is abstracted behind the {@link JiraFetcher}
 * interface so that the connector (Phase 3) can be injected without
 * coupling this module to a specific HTTP client.
 *
 * @module
 */

import type { JiraConfig } from '../config/types.js';
import { getUniqueInstances } from '../config/loader.js';
import { escapeJql } from '../utils/jql.js';
import type { TaskData } from './types.js';
import type { CacheManager } from './manager.js';

// ---------------------------------------------------------------------------
// Jira fetcher abstraction (dependency injection point)
// ---------------------------------------------------------------------------

/**
 * Minimal representation of a Jira issue returned by the search API.
 *
 * Fields mirror the subset used by TaskData so the syncer can map
 * without depending on a third-party Jira client type.
 */
export interface JiraIssue {
  readonly key: string;
  readonly fields: {
    readonly summary: string;
    readonly status: { readonly name: string };
    readonly assignee: { readonly emailAddress: string } | null;
    readonly priority: { readonly name: string } | null;
    readonly issuetype: { readonly name: string };
    readonly created: string;
    readonly updated: string;
    readonly project: { readonly key: string };
    /** Epic link (Jira Cloud custom field). May be absent. */
    readonly customfield_10014?: string | null;
  };
}

/**
 * Abstraction over the Jira search endpoint.
 *
 * Implementers must return issues matching the given JQL. The
 * `instanceUrl` property identifies which Jira instance this fetcher
 * talks to.
 */
export interface JiraFetcher {
  searchIssues(jql: string): Promise<readonly JiraIssue[]>;
  readonly instanceUrl: string;
}

// ---------------------------------------------------------------------------
// Sync options
// ---------------------------------------------------------------------------

export interface SyncOptions {
  /** JQL override. When omitted the syncer uses a default "my tasks" query. */
  readonly jql?: string;
  /** When set, only sync from the instance that owns this project key. */
  readonly projectKey?: string;
}

// ---------------------------------------------------------------------------
// TaskSyncer
// ---------------------------------------------------------------------------

export class TaskSyncer {
  readonly #cacheManager: CacheManager;
  readonly #config: JiraConfig;
  readonly #fetcherFactory: (
    instanceUrl: string,
    username: string,
    apiToken: string,
  ) => JiraFetcher;

  /**
   * @param cacheManager  Cache to write tasks into.
   * @param config  Fully-loaded Jira configuration.
   * @param fetcherFactory  Factory that creates a {@link JiraFetcher} for a
   *   given Jira instance. This is the dependency-injection point for the
   *   HTTP client that will be provided in Phase 3.
   */
  constructor(
    cacheManager: CacheManager,
    config: JiraConfig,
    fetcherFactory: (
      instanceUrl: string,
      username: string,
      apiToken: string,
    ) => JiraFetcher,
  ) {
    this.#cacheManager = cacheManager;
    this.#config = config;
    this.#fetcherFactory = fetcherFactory;
  }

  /**
   * Fetch tasks from every unique Jira instance and persist them to cache.
   *
   * @returns Number of tasks synced.
   */
  async sync(options?: SyncOptions): Promise<number> {
    const jql =
      options?.jql ??
      `assignee = "${escapeJql(this.#config.credentials.username)}" ORDER BY updated DESC`;

    let instances = getUniqueInstances(this.#config);

    // Filter to a single instance when projectKey is provided
    if (options?.projectKey) {
      const projectConfig = this.#config.projects[options.projectKey];
      if (projectConfig) {
        instances = instances.filter((i) => i.url === projectConfig.url);
      }
    }

    const allTasks: TaskData[] = [];

    for (const instance of instances) {
      const fetcher = this.#fetcherFactory(
        instance.url,
        instance.username,
        instance.api_token,
      );

      const issues = await fetcher.searchIssues(jql);

      const tasks = issues.map((issue) =>
        this.#issueToTaskData(issue, instance.url),
      );

      allTasks.push(...tasks);
    }

    await this.#cacheManager.save(allTasks);
    return allTasks.length;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Map a raw Jira issue to the cache's TaskData format.
   */
  #issueToTaskData(issue: JiraIssue, instanceUrl: string): TaskData {
    const assignee = issue.fields.assignee?.emailAddress ?? null;
    const priority = issue.fields.priority?.name ?? 'None';
    const epicLink = issue.fields.customfield_10014 ?? null;

    return {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      assignee,
      priority,
      issue_type: issue.fields.issuetype.name,
      created: issue.fields.created,
      updated: issue.fields.updated,
      project_key: issue.fields.project.key,
      project_url: instanceUrl,
      epic_link: epicLink,
    };
  }
}
