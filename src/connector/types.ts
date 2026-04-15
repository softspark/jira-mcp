/**
 * Lean return types for the Jira connector.
 *
 * Each interface contains only the fields that the MCP server actually uses.
 * This decouples business logic from the raw Jira REST API response shapes.
 *
 * @module
 */

import type { AdfDocument } from '../adf/types.js';

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

/** Minimal issue data returned by JQL search. */
export interface JiraIssue {
  readonly key: string;
  readonly summary: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly priority: string;
  readonly issueType: string;
  readonly created: string;
  readonly updated: string;
  readonly projectKey: string;
  readonly epicLink: string | null;
}

// ---------------------------------------------------------------------------
// Issue details
// ---------------------------------------------------------------------------

/** Full issue details including description and comments. */
export interface JiraIssueDetail {
  readonly key: string;
  readonly summary: string;
  readonly description: AdfDocument | null;
  readonly creator: string;
  readonly creatorAccountId: string | null;
  readonly status: string;
  readonly assignee: string | null;
  readonly priority: string;
  readonly issueType: string;
  readonly created: string;
  readonly updated: string;
  readonly projectKey: string;
  readonly comments: readonly JiraComment[];
  readonly timeTracking: JiraTimeTracking;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** A single Jira comment. */
export interface JiraComment {
  readonly id: string;
  readonly author: string;
  readonly authorAccountId: string | null;
  readonly body: AdfDocument | null;
  readonly created: string;
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** An available workflow transition for an issue. */
export interface JiraTransition {
  readonly id: string;
  readonly name: string;
  readonly toStatus: string;
}

// ---------------------------------------------------------------------------
// Worklogs
// ---------------------------------------------------------------------------

/** A worklog entry returned after logging time. */
export interface JiraWorklog {
  readonly id: string;
  readonly timeSpent: string;
  readonly timeSpentSeconds: number;
  readonly created: string;
}

// ---------------------------------------------------------------------------
// Time tracking
// ---------------------------------------------------------------------------

/** Time tracking information for an issue. */
export interface JiraTimeTracking {
  readonly originalEstimate: string | null;
  readonly remainingEstimate: string | null;
  readonly timeSpent: string | null;
  readonly originalEstimateSeconds: number | null;
  readonly remainingEstimateSeconds: number | null;
  readonly timeSpentSeconds: number | null;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** A Jira field definition (system or custom). */
export interface JiraField {
  readonly id: string;
  readonly name: string;
  readonly custom: boolean;
  readonly schema?: {
    readonly custom?: string;
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** A Jira user returned by the user search API. */
export interface JiraUser {
  readonly accountId: string;
  readonly emailAddress: string | null;
  readonly displayName: string;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Project statuses
// ---------------------------------------------------------------------------

/** Status list grouped by issue type within a project. */
export interface ProjectIssueTypeStatus {
  readonly id: string;
  readonly name: string;
  readonly statuses: readonly {
    readonly name: string;
    readonly id: string;
  }[];
}

// ---------------------------------------------------------------------------
// Issue creation
// ---------------------------------------------------------------------------

/** Result of creating a new Jira issue. */
export interface CreateIssueResult {
  readonly key: string;
  readonly id: string;
  readonly url: string;
}
