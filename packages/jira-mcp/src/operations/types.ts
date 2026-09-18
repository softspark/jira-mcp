// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

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

/** Result of deleting a comment. */
export interface DeleteCommentResult {
  readonly taskKey: string;
  readonly commentId: string;
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
  readonly creator: string | null;
  readonly reporter: string | null;
  readonly priority: string;
  readonly issueType: string;
  readonly created: string;
  readonly updated: string;
  readonly comments: readonly MarkdownComment[];
}

/** Result of deleting a task. */
export interface DeleteTaskResult {
  readonly taskKey: string;
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

// ---------------------------------------------------------------------------
// Tempo worklogs
// ---------------------------------------------------------------------------

/**
 * What a Tempo worklog query is scoped to.
 *
 * Every field but the dates is optional and they combine: a project and a
 * user together mean "this person's time on this project".
 */
export interface TempoWorklogFilter {
  /** Inclusive start day, `YYYY-MM-DD`. */
  readonly from: string;
  /** Inclusive end day, `YYYY-MM-DD`. */
  readonly to: string;
  readonly projectKey?: string;
  readonly taskKey?: string;
  readonly userEmail?: string;
}

/** The person behind a worklog, as far as Jira will say. */
export interface TempoUserRef {
  readonly accountId: string;
  readonly displayName: string;
  /** Null when Jira's privacy settings hide it or the user is unknown. */
  readonly email: string | null;
}

/** One Tempo worklog with its ids resolved through Jira. */
export interface TempoWorklogEntry {
  readonly worklogId: string;
  /** Issue key, or `#<id>` when Jira would not resolve the id. */
  readonly taskKey: string;
  readonly summary: string;
  readonly projectKey: string;
  readonly user: TempoUserRef;
  /** Calendar day of the work, `YYYY-MM-DD`. */
  readonly date: string;
  readonly startTime: string | null;
  readonly timeSpentSeconds: number;
  /** `timeSpentSeconds` as "2h 30m". */
  readonly timeSpent: string;
  readonly billableSeconds: number;
  readonly description: string;
}

/** Dimensions a Tempo report can group by, in the order given. */
export const TEMPO_GROUP_KEYS = ['project', 'user', 'task'] as const;

export type TempoGroupKey = (typeof TEMPO_GROUP_KEYS)[number];

/** One aggregated line of a Tempo report. Only the grouped dimensions are set. */
export interface TempoReportRow {
  readonly project?: string;
  readonly user?: string;
  readonly userEmail?: string | null;
  readonly task?: string;
  readonly summary?: string;
  readonly timeSpentSeconds: number;
  readonly timeSpent: string;
  /** Decimal hours rounded to two places, for spreadsheets. */
  readonly hours: number;
  readonly billableSeconds: number;
  readonly worklogCount: number;
}

/** Hours over a date range, aggregated by the requested dimensions. */
export interface TempoReport {
  readonly from: string;
  readonly to: string;
  readonly groupBy: readonly TempoGroupKey[];
  readonly totalSeconds: number;
  readonly totalTimeSpent: string;
  readonly totalHours: number;
  readonly billableSeconds: number;
  readonly worklogCount: number;
  readonly rows: readonly TempoReportRow[];
}
