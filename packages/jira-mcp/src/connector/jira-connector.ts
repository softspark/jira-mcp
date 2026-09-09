// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Jira API connector using Node.js built-in fetch.
 *
 * Handles a single Jira instance (one URL + one set of credentials).
 * All methods are async and return lean project-owned types rather than
 * exposing raw API response shapes.
 *
 * @module
 */

import type {
  JiraInstanceConfig,
  AdfDocument,
  HttpFailure,
} from '@softspark/atlassian-mcp-core';
import { AtlassianHttpClient } from '@softspark/atlassian-mcp-core';
import type {
  JiraIssue,
  JiraIssueDetail,
  JiraComment,
  JiraTransition,
  JiraWorklog,
  JiraTimeTracking,
  JiraField,
  JiraUser,
  ProjectIssueTypeStatus,
  CreateIssueResult,
} from './types.js';
import {
  JiraAuthenticationError,
  JiraConnectionError,
  JiraPermissionError,
} from '@softspark/atlassian-mcp-core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max results for JQL search. */
const DEFAULT_MAX_RESULTS = 1000;

/** Fields requested during JQL search (lightweight). */
const SEARCH_FIELDS = [
  'summary',
  'status',
  'assignee',
  'priority',
  'issuetype',
  'created',
  'updated',
  'project',
  'customfield_10014', // epic link (common field ID)
];

// ---------------------------------------------------------------------------
// Raw Jira REST API response shapes (internal only)
// ---------------------------------------------------------------------------

/** Partial shape of a Jira issue from the REST API. */
interface RawJiraIssueFields {
  readonly summary: string;
  readonly status?: { readonly name?: string };
  readonly assignee?: { readonly emailAddress?: string; readonly displayName?: string };
  readonly creator?: {
    readonly accountId?: string;
    readonly emailAddress?: string;
    readonly displayName?: string;
  };
  readonly priority?: { readonly name?: string };
  readonly issuetype?: { readonly name?: string };
  readonly issueType?: { readonly name?: string };
  readonly created: string;
  readonly updated: string;
  readonly project?: { readonly key?: string };
  readonly description?: AdfDocument;
  readonly comment?: {
    readonly comments?: readonly RawJiraComment[];
  };
  readonly timetracking?: {
    readonly originalEstimate?: string;
    readonly remainingEstimate?: string;
    readonly timeSpent?: string;
    readonly originalEstimateSeconds?: number;
    readonly remainingEstimateSeconds?: number;
    readonly timeSpentSeconds?: number;
  };
  readonly [key: string]: unknown;
}

interface RawJiraIssue {
  readonly key: string;
  readonly id: string;
  readonly fields: RawJiraIssueFields;
}

interface RawJiraComment {
  readonly id?: string;
  readonly author?: {
    readonly accountId?: string;
    readonly emailAddress?: string;
    readonly displayName?: string;
  };
  readonly body?: AdfDocument;
  readonly created?: string;
}

interface RawJiraSearchResult {
  readonly issues?: readonly RawJiraIssue[];
}

interface RawJiraTransition {
  readonly id?: string;
  readonly name?: string;
  readonly to?: { readonly name?: string };
}

interface RawJiraTransitionsResult {
  readonly transitions?: readonly RawJiraTransition[];
}

interface RawJiraWorklog {
  readonly id?: string;
  readonly timeSpent?: string;
  readonly timeSpentSeconds?: number;
  readonly created?: string;
}

interface RawJiraField {
  readonly id?: string;
  readonly name?: string;
  readonly custom?: boolean;
  readonly schema?: { readonly custom?: string };
}

interface RawJiraUser {
  readonly accountId: string;
  readonly emailAddress?: string;
  readonly displayName?: string;
  readonly active: boolean;
}

interface RawJiraIssueType {
  readonly id: string;
  readonly name: string;
  readonly statuses: readonly {
    readonly name?: string;
    readonly id?: string;
  }[];
}

interface RawJiraCreateResult {
  readonly key: string;
  readonly id: string;
}

// ---------------------------------------------------------------------------
// JiraConnector
// ---------------------------------------------------------------------------

/**
 * Map a Jira HTTP failure onto this package's error vocabulary.
 *
 * Kept as a free function so {@link AtlassianHttpClient} owns retry and the
 * connector owns only which error a status means.
 */
function mapJiraError({ status, detail }: HttpFailure): Error {
  if (status === 401) {
    return new JiraAuthenticationError(`Authentication failed: ${detail}`);
  }
  if (status === 403) {
    return new JiraPermissionError(`Permission denied: ${detail}`);
  }
  return new JiraConnectionError(`Jira API error (${status}): ${detail}`);
}

export class JiraConnector {
  private readonly http: AtlassianHttpClient;
  readonly instanceUrl: string;

  constructor(config: JiraInstanceConfig) {
    this.instanceUrl = config.url;
    this.http = new AtlassianHttpClient(config, mapJiraError);
  }

  // -----------------------------------------------------------------------
  // HTTP helper
  // -----------------------------------------------------------------------

  /**
   * Send an authenticated request to the Jira REST API v3.
   *
   * Transport concerns (auth, retry on 429 and 503, `Retry-After`, empty
   * bodies) live in {@link AtlassianHttpClient}, shared with Confluence.
   * Status-to-error mapping stays here in {@link mapJiraError}.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    return this.http.requestJson<T>(method, path, body, query);
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  /**
   * Search issues with a JQL query.
   *
   * Returns a flat list of issues with only the fields needed for caching.
   */
  async searchIssues(
    jql: string,
    fields?: readonly string[],
  ): Promise<JiraIssue[]> {
    const result = await this.request<RawJiraSearchResult>(
      'GET',
      '/rest/api/3/search/jql',
      undefined,
      {
        jql,
        fields: (fields ? [...fields] : SEARCH_FIELDS).join(','),
        maxResults: String(DEFAULT_MAX_RESULTS),
      },
    );

    const issues = result.issues ?? [];

    return issues.map((issue): JiraIssue => {
      const f = issue.fields;
      return {
        key: issue.key,
        summary: f.summary,
        status: f.status?.name ?? 'Unknown',
        assignee: f.assignee?.emailAddress ?? null,
        priority: f.priority?.name ?? 'None',
        issueType:
          f.issuetype?.name ?? f.issueType?.name ?? 'Unknown',
        created: f.created,
        updated: f.updated,
        projectKey: issue.key.split('-')[0] ?? '',
        epicLink:
          (f['customfield_10014'] as string | undefined) ?? null,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Issue details
  // -----------------------------------------------------------------------

  /**
   * Get full issue details including description, comments, and time tracking.
   */
  async getIssue(issueKey: string): Promise<JiraIssueDetail> {
    const detailFields = [
      'summary',
      'description',
      'creator',
      'status',
      'assignee',
      'priority',
      'issuetype',
      'created',
      'updated',
      'project',
      'comment',
      'timetracking',
    ];

    const issue = await this.request<RawJiraIssue>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      undefined,
      { fields: detailFields.join(',') },
    );

    const f = issue.fields;
    const comments: JiraComment[] = (f.comment?.comments ?? []).map(
      (c): JiraComment => ({
        id: c.id ?? '',
        author:
          c.author?.emailAddress ??
          c.author?.displayName ??
          'Unknown',
        authorAccountId: c.author?.accountId ?? null,
        body: c.body ?? null,
        created: c.created ?? '',
      }),
    );

    return {
      key: issue.key,
      summary: f.summary,
      description: f.description ?? null,
      creator:
        f.creator?.emailAddress ??
        f.creator?.displayName ??
        'Unknown',
      creatorAccountId: f.creator?.accountId ?? null,
      status: f.status?.name ?? 'Unknown',
      assignee: f.assignee?.emailAddress ?? null,
      priority: f.priority?.name ?? 'None',
      issueType:
        f.issuetype?.name ?? f.issueType?.name ?? 'Unknown',
      created: f.created,
      updated: f.updated,
      projectKey: issue.key.split('-')[0] ?? '',
      comments,
      timeTracking: {
        originalEstimate: f.timetracking?.originalEstimate ?? null,
        remainingEstimate: f.timetracking?.remainingEstimate ?? null,
        timeSpent: f.timetracking?.timeSpent ?? null,
        originalEstimateSeconds:
          f.timetracking?.originalEstimateSeconds ?? null,
        remainingEstimateSeconds:
          f.timetracking?.remainingEstimateSeconds ?? null,
        timeSpentSeconds: f.timetracking?.timeSpentSeconds ?? null,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  /**
   * Add an ADF comment to an issue.
   *
   * The comment body must be a valid ADF document. Use `markdownToAdf()`
   * to convert markdown before calling this method.
   */
  async addComment(
    issueKey: string,
    body: AdfDocument,
  ): Promise<JiraComment> {
    const result = await this.request<RawJiraComment>(
      'POST',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      { body },
    );

    return {
      id: result.id ?? '',
      author:
        result.author?.emailAddress ??
        result.author?.displayName ??
        'Unknown',
      authorAccountId: result.author?.accountId ?? null,
      body: result.body ?? null,
      created: result.created ?? '',
    };
  }

  /**
   * Delete a Jira issue permanently.
   */
  async deleteIssue(issueKey: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    );
  }

  /**
   * Delete a comment from a Jira issue.
   */
  async deleteComment(
    issueKey: string,
    commentId: string,
  ): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(commentId)}`,
    );
  }

  // -----------------------------------------------------------------------
  // Transitions
  // -----------------------------------------------------------------------

  /**
   * Get available workflow transitions for an issue.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const result = await this.request<RawJiraTransitionsResult>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    );

    return (result.transitions ?? []).map(
      (t): JiraTransition => ({
        id: t.id ?? '',
        name: t.name ?? '',
        toStatus: t.to?.name ?? '',
      }),
    );
  }

  /**
   * Execute a status transition on an issue.
   */
  async doTransition(
    issueKey: string,
    transitionId: string,
  ): Promise<void> {
    await this.request<undefined>(
      'POST',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      { transition: { id: transitionId } },
    );
  }

  // -----------------------------------------------------------------------
  // Assignment
  // -----------------------------------------------------------------------

  /**
   * Assign an issue to a user by account ID, or unassign by passing null.
   */
  async assignIssue(
    issueKey: string,
    accountId: string | null,
  ): Promise<void> {
    await this.request<undefined>(
      'PUT',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
      { accountId },
    );
  }

  /**
   * Find a Jira user account ID by email address.
   *
   * @throws {JiraConnectionError} If no user is found for the given email.
   */
  async findUser(email: string): Promise<string> {
    const users = await this.request<readonly RawJiraUser[]>(
      'GET',
      '/rest/api/3/user/search',
      undefined,
      { query: email, maxResults: '1' },
    );

    const firstUser = users?.[0];
    if (!firstUser?.accountId) {
      throw new JiraConnectionError(
        `User not found for email: ${email}`,
      );
    }

    return firstUser.accountId;
  }

  /**
   * Return the currently authenticated Jira user.
   */
  async getCurrentUser(): Promise<JiraUser> {
    const user = await this.request<RawJiraUser>(
      'GET',
      '/rest/api/3/myself',
    );

    return {
      accountId: user.accountId,
      emailAddress: user.emailAddress ?? null,
      displayName: user.displayName ?? 'Unknown',
      active: user.active,
    };
  }

  // -----------------------------------------------------------------------
  // Worklogs
  // -----------------------------------------------------------------------

  /**
   * Add a worklog entry to an issue.
   *
   * @param issueKey      Issue key (e.g. "PROJ-123").
   * @param timeSpentSeconds  Time to log in seconds.
   * @param comment       Optional ADF comment describing the work.
   */
  async addWorklog(
    issueKey: string,
    timeSpentSeconds: number,
    comment?: AdfDocument,
  ): Promise<JiraWorklog> {
    const body: Record<string, unknown> = { timeSpentSeconds };
    if (comment) {
      body['comment'] = comment;
    }

    const result = await this.request<RawJiraWorklog>(
      'POST',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
      body,
    );

    return {
      id: result.id ?? '',
      timeSpent: result.timeSpent ?? '',
      timeSpentSeconds: result.timeSpentSeconds ?? timeSpentSeconds,
      created: result.created ?? '',
    };
  }

  // -----------------------------------------------------------------------
  // Time tracking
  // -----------------------------------------------------------------------

  /**
   * Get time tracking information for an issue.
   */
  async getTimeTracking(issueKey: string): Promise<JiraTimeTracking> {
    const issue = await this.request<RawJiraIssue>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      undefined,
      { fields: 'timetracking' },
    );

    const tt = issue.fields.timetracking;
    return {
      originalEstimate: tt?.originalEstimate ?? null,
      remainingEstimate: tt?.remainingEstimate ?? null,
      timeSpent: tt?.timeSpent ?? null,
      originalEstimateSeconds: tt?.originalEstimateSeconds ?? null,
      remainingEstimateSeconds: tt?.remainingEstimateSeconds ?? null,
      timeSpentSeconds: tt?.timeSpentSeconds ?? null,
    };
  }

  // -----------------------------------------------------------------------
  // Issue creation / update
  // -----------------------------------------------------------------------

  /**
   * Create a new Jira issue.
   *
   * Accepts a flexible field map so callers can pass project, issue type,
   * summary, description, epic link, custom fields, etc.
   */
  async createIssue(
    fields: Record<string, unknown>,
  ): Promise<CreateIssueResult> {
    const result = await this.request<RawJiraCreateResult>(
      'POST',
      '/rest/api/3/issue',
      { fields },
    );

    return {
      key: result.key,
      id: result.id,
      url: `${this.instanceUrl}/browse/${result.key}`,
    };
  }

  /**
   * Update an existing Jira issue.
   *
   * Only the provided fields are changed; omitted fields are left untouched.
   */
  async updateIssue(
    issueKey: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request<undefined>(
      'PUT',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      { fields },
    );
  }

  // -----------------------------------------------------------------------
  // Field metadata
  // -----------------------------------------------------------------------

  /**
   * Return all system and custom field definitions.
   *
   * Useful for discovering the Epic Link field ID which varies per instance.
   */
  async getFields(): Promise<JiraField[]> {
    const fields = await this.request<readonly RawJiraField[]>(
      'GET',
      '/rest/api/3/field',
    );

    return fields.map(
      (f): JiraField => ({
        id: f.id ?? '',
        name: f.name ?? '',
        custom: f.custom ?? false,
        ...(f.schema?.custom !== undefined
          ? { schema: { custom: f.schema.custom } }
          : {}),
      }),
    );
  }

  // -----------------------------------------------------------------------
  // User search
  // -----------------------------------------------------------------------

  /**
   * Search for Jira users by email or display name.
   *
   * Returns at most `maxResults` users (default 50).
   */
  async searchUsers(
    query: string,
    maxResults = 50,
  ): Promise<JiraUser[]> {
    const users = await this.request<readonly RawJiraUser[]>(
      'GET',
      '/rest/api/3/user/search',
      undefined,
      { query, maxResults: String(maxResults) },
    );

    return (users ?? []).map(
      (u): JiraUser => ({
        accountId: u.accountId,
        emailAddress: u.emailAddress ?? null,
        displayName: u.displayName ?? 'Unknown',
        active: u.active,
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Project statuses
  // -----------------------------------------------------------------------

  /**
   * Get all valid statuses grouped by issue type for a project.
   *
   * Used by WorkflowCache to build a map of allowed transitions.
   */
  async getProjectStatuses(
    projectKey: string,
  ): Promise<ProjectIssueTypeStatus[]> {
    const issueTypes = await this.request<readonly RawJiraIssueType[]>(
      'GET',
      `/rest/api/3/project/${encodeURIComponent(projectKey)}/statuses`,
    );

    return issueTypes.map(
      (it): ProjectIssueTypeStatus => ({
        id: it.id,
        name: it.name,
        statuses: it.statuses.map((s) => ({
          name: s.name ?? '',
          id: s.id ?? '',
        })),
      }),
    );
  }
}
