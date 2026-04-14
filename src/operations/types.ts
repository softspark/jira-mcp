/**
 * Return types for task operation results.
 *
 * These types represent the outcome of business-logic operations
 * (status change, comment, reassign, etc.) and are consumed by
 * the MCP tool handlers.
 *
 * @module
 */

import type { TaskData } from '../cache/types.js';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Result of a status change operation. */
export interface TaskUpdateResult {
  readonly taskKey: string;
  readonly updatedTask: TaskData;
}

/** A single available status transition. */
export interface StatusTransition {
  readonly id: string;
  readonly name: string;
  readonly toStatus: string;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** Result of adding a comment. */
export interface CommentResult {
  readonly taskKey: string;
  readonly commentId: string;
  readonly author: string;
  readonly bodyMarkdown: string;
  readonly created: string;
}

// ---------------------------------------------------------------------------
// Task details
// ---------------------------------------------------------------------------

/** A comment rendered as markdown. */
export interface MarkdownComment {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly created: string;
}

/** Full task details with description and comments as markdown. */
export interface TaskDetail {
  readonly key: string;
  readonly summary: string;
  readonly description: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly priority: string;
  readonly issueType: string;
  readonly created: string;
  readonly updated: string;
  readonly comments: readonly MarkdownComment[];
}

// ---------------------------------------------------------------------------
// Worklog
// ---------------------------------------------------------------------------

/** Result of logging time on a task. */
export interface WorklogResult {
  readonly taskKey: string;
  readonly worklogId: string;
  readonly timeSpent: string;
  readonly timeSpentSeconds: number;
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

/** Time tracking summary for a task. */
export interface TimeTrackingResult {
  readonly taskKey: string;
  readonly originalEstimate: string | null;
  readonly remainingEstimate: string | null;
  readonly timeSpent: string | null;
}
