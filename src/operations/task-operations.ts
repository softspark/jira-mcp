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
import type {
  TaskUpdateResult,
  CommentResult,
  StatusTransition,
  TaskDetail,
  MarkdownComment,
  WorklogResult,
  TimeTrackingResult,
} from './types.js';
import { markdownToAdf } from '../adf/markdown-to-adf.js';
import { adfToMarkdown } from '../adf/adf-to-markdown.js';
import { parseTimeSpent } from '../connector/time-parser.js';
import { JiraConnectionError } from '../errors/index.js';

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

    // Update cache to reflect new status
    const updatedTask = await this.cacheManager.updateTask(taskKey, {
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
   */
  async addComment(
    taskKey: string,
    markdownComment: string,
  ): Promise<CommentResult> {
    const adfBody = markdownToAdf(markdownComment);
    const comment = await this.connector.addComment(taskKey, adfBody);

    return {
      taskKey,
      commentId: comment.id,
      author: comment.author,
      bodyMarkdown: adfToMarkdown(comment.body),
      created: comment.created,
    };
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

    const updatedTask = await this.cacheManager.updateTask(taskKey, {
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
   * (description and comment bodies) to readable markdown.
   */
  async getTaskDetails(taskKey: string): Promise<TaskDetail> {
    const issue = await this.connector.getIssue(taskKey);

    const markdownComments: MarkdownComment[] = issue.comments.map(
      (c): MarkdownComment => ({
        id: c.id,
        author: c.author,
        body: adfToMarkdown(c.body),
        created: c.created,
      }),
    );

    return {
      key: issue.key,
      summary: issue.summary,
      description: adfToMarkdown(issue.description),
      status: issue.status,
      assignee: issue.assignee,
      priority: issue.priority,
      issueType: issue.issueType,
      created: issue.created,
      updated: issue.updated,
      comments: markdownComments,
    };
  }

  // -----------------------------------------------------------------------
  // Time logging
  // -----------------------------------------------------------------------

  /**
   * Log work time on a task.
   *
   * Accepts human-readable time format ("2h 30m"), converts to seconds,
   * and optionally attaches a markdown comment.
   *
   * After logging, the task is removed from cache to force a refresh
   * on next read (time tracking data changed).
   *
   * @throws {Error} If timeSpent format is invalid or contains days.
   */
  async logTime(
    taskKey: string,
    timeSpent: string,
    comment?: string,
  ): Promise<WorklogResult> {
    const seconds = parseTimeSpent(timeSpent);

    const adfComment = comment ? markdownToAdf(comment) : undefined;
    const worklog = await this.connector.addWorklog(
      taskKey,
      seconds,
      adfComment,
    );

    // Invalidate cache -- time tracking data changed
    try {
      await this.cacheManager.deleteTask(taskKey);
    } catch {
      // Task may not be in cache; that is fine
    }

    return {
      taskKey,
      worklogId: worklog.id,
      timeSpent,
      timeSpentSeconds: worklog.timeSpentSeconds,
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
}
