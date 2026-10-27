// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Business logic layer for Jira task operations.
 *
 * Orchestrates between:
 *  - JiraConnector  (Jira REST API)
 *  - CacheManager   (local JSON cache)
 *  - ADF converters (markdown <-> ADF)
 *
 * All mutations update both Jira and the local cache.
 *
 * @module
 */

import type { JiraConnector } from '../connector/jira-connector.js';
import type { CacheManager } from '../cache/manager.js';
import type { TaskData } from '../cache/types.js';
import type {
  AddCommentOptions,
  LogTimeOptions,
  TaskUpdateResult,
  CommentResult,
  DeleteCommentResult,
  DeleteTaskResult,
  StatusTransition,
  TaskDetail,
  MarkdownComment,
  WorklogResult,
  TimeTrackingResult,
} from './types.js';
import { markdownToAdf, adfToMarkdown } from '@softspark/atlassian-mcp-core';
import { parseTimeSpent } from '../connector/time-parser.js';
import {
  DEFAULT_COMMENT,
  InvalidInputError,
  JiraConnectionError,
  OwnershipError,
  CommentNotFoundError,
  TaskNotFoundError,
  CacheNotFoundError,
} from '@softspark/atlassian-mcp-core';

/** `projectTypeKey` of a Jira Service Management project. */
const SERVICE_PROJECT_TYPE = 'service_desk';

// ---------------------------------------------------------------------------
// TaskOperations
// ---------------------------------------------------------------------------

export class TaskOperations {
  constructor(
    private readonly connector: JiraConnector,
    private readonly cacheManager: CacheManager,
  ) {}

  // -----------------------------------------------------------------------
  // Status
  // -----------------------------------------------------------------------

  /**
   * Change a task's status via a workflow transition.
   *
   * Finds the transition whose name matches `statusName` (case-insensitive),
   * executes it, and updates the local cache.
   *
   * @throws {JiraConnectionError} If no matching transition is found.
   */
  async changeStatus(
    taskKey: string,
    statusName: string,
  ): Promise<TaskUpdateResult> {
    const transitions = await this.connector.getTransitions(taskKey);

    // Match by target status name first, then fallback to transition name
    const target = transitions.find(
      (t) => t.toStatus.toLowerCase() === statusName.toLowerCase(),
    ) ?? transitions.find(
      (t) => t.name.toLowerCase() === statusName.toLowerCase(),
    );

    if (!target) {
      const available = transitions.map((t) => `${t.name} -> ${t.toStatus}`).join(', ');
      throw new JiraConnectionError(
        `Status '${statusName}' not available for ${taskKey}. ` +
          `Available transitions: ${available}`,
      );
    }

    await this.connector.doTransition(taskKey, target.id);

    // Update cache to reflect new status. If the task is not in the local
    // cache (fresh create_task, or cache invalidated by log_time), refresh
    // from Jira and upsert so the caller still gets a populated TaskData.
    const updatedTask = await this.#updateOrRefreshCache(taskKey, {
      status: target.toStatus || statusName,
    });

    return { taskKey, updatedTask };
  }

  /**
   * Get all available status transitions for a task.
   */
  async getAvailableStatuses(
    taskKey: string,
  ): Promise<StatusTransition[]> {
    const transitions = await this.connector.getTransitions(taskKey);

    return transitions.map(
      (t): StatusTransition => ({
        id: t.id,
        name: t.name,
        toStatus: t.toStatus,
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  /**
   * Add a markdown comment to a task.
   *
   * Converts the markdown to ADF before sending to the Jira v3 API,
   * then converts the response body back to markdown for the result.
   *
   * An explicit `internal` wins. Without it a service project falls back to
   * `serviceDefault` (public unless the project is set to internal), and any
   * other project type posts an ordinary comment.
   *
   * @throws {InvalidInputError} When `internal: true` is asked for outside a
   *   service project, where Jira would store the flag and still show the
   *   comment to everyone.
   */
  async addComment(
    taskKey: string,
    markdownComment: string,
    options: AddCommentOptions = {},
  ): Promise<CommentResult> {
    const internal = await this.resolveInternal(taskKey, options);
    const adfBody = markdownToAdf(markdownComment);
    const comment = await this.connector.addComment(taskKey, adfBody, {
      ...(options.visibility ? { visibility: options.visibility } : {}),
      ...(internal ? { internal: true } : {}),
    });

    return {
      taskKey,
      commentId: comment.id,
      author: comment.author,
      bodyMarkdown: adfToMarkdown(comment.body),
      created: comment.created,
      visibility: comment.visibility,
      internal,
    };
  }

  private async resolveInternal(
    taskKey: string,
    options: AddCommentOptions,
  ): Promise<boolean> {
    if (options.internal === false) {
      return false;
    }
    const projectKey = taskKey.split('-')[0] ?? '';
    const projectType = await this.connector.getProjectTypeKey(projectKey);
    const isServiceProject = projectType === SERVICE_PROJECT_TYPE;
    if (options.internal === true && !isServiceProject) {
      throw new InvalidInputError(
        `internal comments exist only in Jira Service Management projects, and ${projectKey} is ` +
          `${projectType ?? 'of unknown type'}. Use visibility to limit the comment to a role or group.`,
      );
    }
    if (options.internal === true) {
      return true;
    }
    return isServiceProject && (options.serviceDefault ?? DEFAULT_COMMENT) === 'internal';
  }

  /**
   * Delete a comment, but only if the authenticated user authored it.
   */
  async deleteComment(
    taskKey: string,
    commentId: string,
  ): Promise<DeleteCommentResult> {
    const currentUser = await this.connector.getCurrentUser();
    const issue = await this.connector.getIssue(taskKey);
    const comment = issue.comments.find((c) => c.id === commentId);

    if (!comment) {
      throw new CommentNotFoundError(
        `Comment ${commentId} not found on ${taskKey}.`,
      );
    }

    if (comment.authorAccountId == null || comment.authorAccountId !== currentUser.accountId) {
      throw new OwnershipError(
        `Comment ${commentId} on ${taskKey} can only be deleted by its author.`,
      );
    }

    await this.connector.deleteComment(taskKey, commentId);
    return { taskKey, commentId };
  }

  // -----------------------------------------------------------------------
  // Assignment
  // -----------------------------------------------------------------------

  /**
   * Reassign a task to a user by email, or unassign if email is null.
   *
   * Looks up the user's account ID from their email address, then
   * assigns the issue and updates the cache.
   */
  async reassign(
    taskKey: string,
    assigneeEmail: string | null,
  ): Promise<TaskUpdateResult> {
    if (assigneeEmail) {
      const accountId = await this.connector.findUser(assigneeEmail);
      await this.connector.assignIssue(taskKey, accountId);
    } else {
      await this.connector.assignIssue(taskKey, null);
    }

    const updatedTask = await this.#updateOrRefreshCache(taskKey, {
      assignee: assigneeEmail ?? null,
    });

    return { taskKey, updatedTask };
  }

  // -----------------------------------------------------------------------
  // Task details
  // -----------------------------------------------------------------------

  /**
   * Get full task details with description and comments as markdown.
   *
   * Fetches the issue from Jira and converts all ADF content
   * (description and comment bodies) to readable markdown. Comment
   * properties come from a second call, because the issue's comment field
   * never carries them.
   */
  async getTaskDetails(taskKey: string): Promise<TaskDetail> {
    const [issue, internalIds] = await Promise.all([
      this.connector.getIssue(taskKey),
      this.connector.getInternalCommentIds(taskKey),
    ]);

    const markdownComments: MarkdownComment[] = issue.comments.map(
      (c): MarkdownComment => ({
        id: c.id,
        author: c.author,
        body: adfToMarkdown(c.body),
        created: c.created,
        visibility: c.visibility,
        internal: internalIds.has(c.id),
      }),
    );

    return {
      key: issue.key,
      summary: issue.summary,
      description: adfToMarkdown(issue.description),
      status: issue.status,
      assignee: issue.assignee,
      creator: issue.creator,
      reporter: issue.reporter,
      priority: issue.priority,
      issueType: issue.issueType,
      created: issue.created,
      updated: issue.updated,
      comments: markdownComments,
    };
  }

  /**
   * Delete a task, but only if the authenticated user created it.
   */
  async deleteTask(taskKey: string): Promise<DeleteTaskResult> {
    const currentUser = await this.connector.getCurrentUser();
    const issue = await this.connector.getIssue(taskKey);

    if (issue.creatorAccountId == null || issue.creatorAccountId !== currentUser.accountId) {
      throw new OwnershipError(
        `Task ${taskKey} can only be deleted by its creator.`,
      );
    }

    await this.connector.deleteIssue(taskKey);

    try {
      await this.cacheManager.deleteTask(taskKey);
    } catch (err: unknown) {
      if (!(err instanceof TaskNotFoundError || err instanceof CacheNotFoundError)) {
        throw err;
      }
    }

    return { taskKey };
  }

  // -----------------------------------------------------------------------
  // Time logging
  // -----------------------------------------------------------------------

  /**
   * Log work time on a task.
   *
   * Accepts human-readable time format ("2h 30m"), converts to seconds,
   * and optionally attaches a markdown comment and a visibility restriction.
   *
   * After logging, the task is removed from cache to force a refresh
   * on next read (time tracking data changed).
   *
   * @throws {Error} If timeSpent format is invalid or contains days.
   */
  async logTime(
    taskKey: string,
    timeSpent: string,
    options: LogTimeOptions = {},
  ): Promise<WorklogResult> {
    const seconds = parseTimeSpent(timeSpent);

    const worklog = await this.connector.addWorklog(taskKey, seconds, {
      ...(options.comment ? { comment: markdownToAdf(options.comment) } : {}),
      ...(options.visibility ? { visibility: options.visibility } : {}),
    });

    // Invalidate cache -- time tracking data changed
    try {
      await this.cacheManager.deleteTask(taskKey);
    } catch (err: unknown) {
      if (!(err instanceof TaskNotFoundError || err instanceof CacheNotFoundError)) {
        throw err;
      }
    }

    return {
      taskKey,
      worklogId: worklog.id,
      timeSpent,
      timeSpentSeconds: worklog.timeSpentSeconds,
      visibility: worklog.visibility,
    };
  }

  /**
   * Get time tracking information for a task.
   */
  async getTimeTracking(taskKey: string): Promise<TimeTrackingResult> {
    const tracking = await this.connector.getTimeTracking(taskKey);

    return {
      taskKey,
      originalEstimate: tracking.originalEstimate,
      remainingEstimate: tracking.remainingEstimate,
      timeSpent: tracking.timeSpent,
    };
  }

  // -----------------------------------------------------------------------
  // Cache recovery
  // -----------------------------------------------------------------------

  /**
   * Update the cache entry for a task, recovering from a cache miss by
   * refreshing the whole row from Jira.
   *
   * Mutation tools (`changeStatus`, `reassign`) call Jira first and then
   * mirror the change into the local cache. When the task isn't cached
   * (right after `create_task`, or after `logTime` invalidated it), a
   * plain `updateTask` throws `TaskNotFoundError` / `CacheNotFoundError`
   * even though the Jira mutation already succeeded. In that case we
   * fetch the authoritative row from Jira and upsert it so the caller
   * receives a fully populated TaskData.
   */
  async #updateOrRefreshCache(
    taskKey: string,
    updates: Partial<Omit<TaskData, 'key'>>,
  ): Promise<TaskData> {
    try {
      return await this.cacheManager.updateTask(taskKey, updates);
    } catch (err: unknown) {
      if (!(err instanceof TaskNotFoundError || err instanceof CacheNotFoundError)) {
        throw err;
      }
      const issue = await this.connector.getIssue(taskKey);
      const fresh: TaskData = {
        key: issue.key,
        summary: issue.summary,
        status: issue.status,
        assignee: issue.assignee,
        creator: issue.creator,
        reporter: issue.reporter,
        priority: issue.priority,
        issue_type: issue.issueType,
        created: issue.created,
        updated: issue.updated,
        project_key: issue.projectKey,
        project_url: this.connector.instanceUrl,
        epic_link: null,
        ...updates,
      };
      return await this.cacheManager.upsertTask(fresh);
    }
  }
}
