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

import { z } from 'zod';

import type {
  JiraInstanceConfig,
  AdfDocument,
  HttpFailure,
} from '@softspark/atlassian-mcp-core';
import { AtlassianHttpClient } from '@softspark/atlassian-mcp-core';
import type {
  AttachmentUpload,
  JiraAttachment,
  JiraIssue,
  JiraIssueDetail,
  JiraComment,
  CommentOptions,
  JiraVisibility,
  JiraTransition,
  JiraWorklog,
  WorklogOptions,
  JiraTimeTracking,
  JiraField,
  JiraUser,
  ProjectIssueTypeStatus,
  CreateIssueResult,
  JiraIssueRef,
  JiraProject,
} from './types.js';
import { DEFAULT_MEDIA_TYPE } from '../utils/media-type.js';
import {
  AttachmentTooLargeError,
  IssueNotFoundError,
  JiraAuthenticationError,
  JiraConnectionError,
  JiraPermissionError,
} from '@softspark/atlassian-mcp-core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max results for JQL search. */
const DEFAULT_MAX_RESULTS = 1000;

/** Comment property Jira Service Management reads to tell internal from public. */
const SD_COMMENT_PROPERTY = 'sd.public.comment';

/** Comments per page when reading comment properties. */
const COMMENT_PAGE_SIZE = 100;

/** Issues per `issue/bulkfetch` call; the endpoint rejects more than 100. */
const BULK_FETCH_CHUNK = 100;

/** Account ids per `user/bulk` call; the endpoint caps the list at 128. */
const USER_BULK_CHUNK = 100;

/** Fields requested during JQL search (lightweight). */
const SEARCH_FIELDS = [
  'summary',
  'status',
  'assignee',
  'creator',
  'reporter',
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

/** A user reference embedded in an issue field (`creator`, `reporter`). */
interface RawJiraPerson {
  readonly accountId?: string;
  readonly emailAddress?: string;
  readonly displayName?: string;
}

/**
 * Name a person the way the rest of the API does: email when Jira shows it,
 * display name when Atlassian privacy hides the email, null when unset.
 */
function personLabel(person: RawJiraPerson | null | undefined): string | null {
  return person?.emailAddress ?? person?.displayName ?? null;
}

/** Partial shape of a Jira issue from the REST API. */
interface RawJiraIssueFields {
  readonly summary: string;
  readonly status?: { readonly name?: string };
  readonly assignee?: { readonly emailAddress?: string; readonly displayName?: string };
  readonly creator?: RawJiraPerson | null;
  readonly reporter?: RawJiraPerson | null;
  readonly priority?: { readonly name?: string };
  readonly issuetype?: { readonly name?: string };
  readonly issueType?: { readonly name?: string };
  readonly created: string;
  readonly updated: string;
  readonly project?: { readonly id?: string; readonly key?: string };
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
  readonly visibility?: RawJiraVisibility;
  readonly properties?: readonly {
    readonly key?: string;
    readonly value?: unknown;
  }[];
}

/** One page of `GET /issue/{key}/comment`. */
interface RawJiraCommentPage {
  readonly comments?: readonly RawJiraComment[];
  readonly total?: number;
}

/** True when the comment carries `sd.public.comment` with `internal: true`. */
function isInternalComment(comment: RawJiraComment): boolean {
  const property = comment.properties?.find((p) => p.key === SD_COMMENT_PROPERTY);
  const value = property?.value as { readonly internal?: unknown } | undefined;
  return value?.internal === true;
}

interface RawJiraVisibility {
  readonly type?: string;
  readonly value?: string;
  readonly identifier?: string;
}

/** Keep a restriction only when Jira names a type this server knows. */
function toVisibility(raw: RawJiraVisibility | undefined): JiraVisibility | null {
  if (raw?.type !== 'group' && raw?.type !== 'role') {
    return null;
  }
  return {
    type: raw.type,
    ...(raw.value !== undefined ? { value: raw.value } : {}),
    ...(raw.identifier !== undefined ? { identifier: raw.identifier } : {}),
  };
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
  readonly visibility?: RawJiraVisibility;
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

/** `issue/bulkfetch` returns a partial `fields` block and never `created`. */
interface RawJiraBulkIssue {
  readonly id: string;
  readonly key: string;
  readonly fields?: {
    readonly summary?: string;
    readonly project?: { readonly id?: string; readonly key?: string };
    readonly issuetype?: { readonly name?: string };
  };
}

interface RawJiraBulkFetchResult {
  readonly issues?: readonly RawJiraBulkIssue[];
}

interface RawJiraProject {
  readonly id: string;
  readonly key: string;
  readonly name?: string;
  readonly projectTypeKey?: string;
}

interface RawJiraUserBulkResult {
  readonly values?: readonly RawJiraUser[];
}

/**
 * One attachment as Jira returns it, from an upload or from `fields.attachment`.
 *
 * Validated with Zod rather than cast, because the upload result is handed
 * back to an agent as proof that the file landed: a shape drift must fail
 * loudly instead of reporting an attachment with an empty id.
 */
const RawJiraAttachmentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  filename: z.string(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  created: z.string().optional(),
  content: z.string().optional(),
  author: z
    .object({
      accountId: z.string().optional(),
      emailAddress: z.string().optional(),
      displayName: z.string().optional(),
    })
    .nullish(),
});

type RawJiraAttachment = z.infer<typeof RawJiraAttachmentSchema>;

/** `POST /issue/{key}/attachments` answers with an array, one per file part. */
const RawAttachmentUploadSchema = z.array(RawJiraAttachmentSchema);

/** `GET /issue/{key}?fields=attachment`; the field is absent when empty on some sites. */
const RawIssueAttachmentsSchema = z.object({
  fields: z
    .object({ attachment: z.array(RawJiraAttachmentSchema).nullish() })
    .optional(),
});

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

/**
 * Error mapping for the attachment endpoints.
 *
 * Narrower than {@link mapJiraError} on purpose: a 404 there means "issue not
 * found or not visible" and a 413 means "file too large", both of which the
 * caller can act on. Giving every Jira call those codes would change what
 * existing tools answer, so only the attachment calls use this mapper.
 */
function mapJiraAttachmentError(failure: HttpFailure): Error {
  const { status, detail } = failure;
  if (status === 403) {
    return new JiraPermissionError(
      `Permission denied: the account may lack Browse Projects or Create Attachments on this project, or attachments are disabled on the site. ${detail}`,
    );
  }
  if (status === 404) {
    return new IssueNotFoundError(
      `Issue not found, or not visible to this account: ${detail}`,
    );
  }
  if (status === 413) {
    return new AttachmentTooLargeError(
      `Jira refused the attachment as too large (site attachment size limit or the issue's attachment limit): ${detail}`,
    );
  }
  return mapJiraError(failure);
}

export class JiraConnector {
  private readonly http: AtlassianHttpClient;
  private readonly attachmentHttp: AtlassianHttpClient;
  private readonly projectTypeKeys = new Map<string, string | null>();
  readonly instanceUrl: string;

  constructor(config: JiraInstanceConfig) {
    this.instanceUrl = config.url;
    this.http = new AtlassianHttpClient(config, mapJiraError);
    this.attachmentHttp = new AtlassianHttpClient(
      config,
      mapJiraAttachmentError,
    );
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
        creator: personLabel(f.creator),
        reporter: personLabel(f.reporter),
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
      'reporter',
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
        visibility: toVisibility(c.visibility),
      }),
    );

    return {
      key: issue.key,
      summary: f.summary,
      description: f.description ?? null,
      creator: personLabel(f.creator),
      creatorAccountId: f.creator?.accountId ?? null,
      reporter: personLabel(f.reporter),
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
   * to convert markdown before calling this method. Without `visibility`
   * the comment is visible to everyone who can browse the issue, and in a
   * service project without `internal` it also reaches the customer.
   */
  async addComment(
    issueKey: string,
    body: AdfDocument,
    options: CommentOptions = {},
  ): Promise<JiraComment> {
    const result = await this.request<RawJiraComment>(
      'POST',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        body,
        ...(options.visibility ? { visibility: options.visibility } : {}),
        ...(options.internal
          ? { properties: [{ key: SD_COMMENT_PROPERTY, value: { internal: true } }] }
          : {}),
      },
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
      visibility: toVisibility(result.visibility),
    };
  }

  /**
   * Ids of the issue's Service Management internal comments.
   *
   * The issue's `comment` field never carries comment properties, so this
   * reads `GET /issue/{key}/comment?expand=properties` page by page.
   */
  async getInternalCommentIds(issueKey: string): Promise<ReadonlySet<string>> {
    const ids = new Set<string>();
    let startAt = 0;
    for (;;) {
      const page = await this.request<RawJiraCommentPage>(
        'GET',
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
        undefined,
        {
          expand: 'properties',
          startAt: String(startAt),
          maxResults: String(COMMENT_PAGE_SIZE),
        },
      );
      const comments = page.comments ?? [];
      for (const c of comments) {
        if (c.id !== undefined && isInternalComment(c)) {
          ids.add(c.id);
        }
      }
      startAt += comments.length;
      if (comments.length === 0 || startAt >= (page.total ?? 0)) {
        return ids;
      }
    }
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
   * @param options       Optional ADF `comment` describing the work and
   *                      `visibility` restricting who sees the entry.
   */
  async addWorklog(
    issueKey: string,
    timeSpentSeconds: number,
    options: WorklogOptions = {},
  ): Promise<JiraWorklog> {
    const body: Record<string, unknown> = { timeSpentSeconds };
    if (options.comment) {
      body['comment'] = options.comment;
    }
    if (options.visibility) {
      body['visibility'] = options.visibility;
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
      visibility: toVisibility(result.visibility),
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

  /**
   * Look up users by account id, in chunks of {@link USER_BULK_CHUNK}.
   *
   * Ids Jira does not know are left out of the result rather than raising,
   * because a worklog whose author has since been deactivated is still a
   * worklog. `emailAddress` is null whenever the user's privacy settings
   * hide it, which is the default on many sites.
   */
  async getUsersByAccountIds(
    accountIds: readonly string[],
  ): Promise<JiraUser[]> {
    const users: JiraUser[] = [];

    for (let i = 0; i < accountIds.length; i += USER_BULK_CHUNK) {
      const params = new URLSearchParams({
        maxResults: String(USER_BULK_CHUNK),
      });
      for (const id of accountIds.slice(i, i + USER_BULK_CHUNK)) {
        params.append('accountId', id);
      }

      const result = await this.request<RawJiraUserBulkResult>(
        'GET',
        `/rest/api/3/user/bulk?${params.toString()}`,
      );

      for (const u of result.values ?? []) {
        users.push({
          accountId: u.accountId,
          emailAddress: u.emailAddress ?? null,
          displayName: u.displayName ?? 'Unknown',
          active: u.active,
        });
      }
    }

    return users;
  }

  // -----------------------------------------------------------------------
  // Issue and project references
  // -----------------------------------------------------------------------

  /**
   * Resolve issue ids or keys to their identity, in chunks of
   * {@link BULK_FETCH_CHUNK}.
   *
   * Accepts a mix of numeric ids and keys because `issue/bulkfetch` does.
   * Ids that do not resolve (deleted issue, no browse permission) are
   * silently absent from the result; the caller decides what a missing
   * issue means for its report.
   */
  async getIssuesByIdsOrKeys(
    idsOrKeys: readonly string[],
  ): Promise<JiraIssueRef[]> {
    const refs: JiraIssueRef[] = [];

    for (let i = 0; i < idsOrKeys.length; i += BULK_FETCH_CHUNK) {
      const result = await this.request<RawJiraBulkFetchResult>(
        'POST',
        '/rest/api/3/issue/bulkfetch',
        {
          issueIdsOrKeys: idsOrKeys.slice(i, i + BULK_FETCH_CHUNK),
          fields: ['summary', 'project', 'issuetype'],
        },
      );

      for (const issue of result.issues ?? []) {
        const f = issue.fields;
        refs.push({
          id: issue.id,
          key: issue.key,
          summary: f?.summary ?? '',
          projectId: f?.project?.id ?? '',
          projectKey: f?.project?.key ?? issue.key.split('-')[0] ?? '',
          issueType: f?.issuetype?.name ?? 'Unknown',
        });
      }
    }

    return refs;
  }

  /**
   * Get a project's identity by key.
   *
   * Tempo filters by numeric project id, and the id is not derivable from
   * the key, so any project-scoped Tempo query starts here.
   */
  async getProject(projectKey: string): Promise<JiraProject> {
    const project = await this.request<RawJiraProject>(
      'GET',
      `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
    );

    return {
      id: project.id,
      key: project.key,
      name: project.name ?? project.key,
    };
  }

  /**
   * A project's type: `software`, `business`, `service_desk` or `product_discovery`.
   *
   * Null when Jira omits it. Internal comments exist only in `service_desk`.
   * Every comment asks, and a project practically never changes type, so the
   * answer is kept for the life of this connector (the server process).
   */
  async getProjectTypeKey(projectKey: string): Promise<string | null> {
    const cached = this.projectTypeKeys.get(projectKey);
    if (cached !== undefined) {
      return cached;
    }
    const project = await this.request<RawJiraProject>(
      'GET',
      `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
    );
    const typeKey = project.projectTypeKey ?? null;
    this.projectTypeKeys.set(projectKey, typeKey);
    return typeKey;
  }

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------

  /**
   * Upload one file as an issue attachment.
   *
   * Multipart with the part named `file`, as Jira requires; the shared client
   * adds `X-Atlassian-Token: no-check`, without which Jira blocks the request.
   * Jira answers with an array because one request may carry several parts.
   */
  async addAttachment(
    issueKey: string,
    upload: AttachmentUpload,
  ): Promise<JiraAttachment[]> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([upload.content], { type: upload.mediaType }),
      upload.filename,
    );

    const raw = await this.attachmentHttp.requestMultipart<unknown>(
      'POST',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
      form,
      '/rest/api/3/issue/{issueKey}/attachments',
    );

    const parsed = RawAttachmentUploadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new JiraConnectionError(
        `Unexpected attachment upload response from Jira for ${issueKey}: ${parsed.error.message}`,
      );
    }
    return parsed.data.map((a) => this.#toAttachment(a));
  }

  /** List attachment metadata for an issue. Binary content is never fetched. */
  async getAttachments(issueKey: string): Promise<JiraAttachment[]> {
    const raw = await this.attachmentHttp.requestJson<unknown>(
      'GET',
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      undefined,
      { fields: 'attachment' },
    );

    const parsed = RawIssueAttachmentsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new JiraConnectionError(
        `Unexpected attachment list response from Jira for ${issueKey}: ${parsed.error.message}`,
      );
    }
    return (parsed.data.fields?.attachment ?? []).map((a) =>
      this.#toAttachment(a),
    );
  }

  #toAttachment(a: RawJiraAttachment): JiraAttachment {
    return {
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType ?? DEFAULT_MEDIA_TYPE,
      size: a.size ?? 0,
      created: a.created ?? '',
      author: personLabel(a.author),
      authorAccountId: a.author?.accountId ?? null,
      contentUrl:
        a.content ??
        new URL(
          `/rest/api/3/attachment/content/${encodeURIComponent(a.id)}`,
          this.instanceUrl,
        ).toString(),
    };
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
