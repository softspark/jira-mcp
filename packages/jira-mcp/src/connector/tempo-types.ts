// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Lean return types for the Tempo connector.
 *
 * Tempo REST API v4 identifies everything by number: a worklog carries the
 * Jira issue id, never the key, and the author's account id, never a name.
 * These types keep that raw shape. Turning ids into keys and names is a Jira
 * lookup and belongs to the operations layer.
 *
 * @module
 */

/** One Tempo worklog as v4 returns it, minus the fields nothing here reads. */
export interface TempoWorklog {
  readonly id: string;
  /** Numeric Jira issue id. Resolve to a key through Jira. */
  readonly issueId: string;
  /** Atlassian account id of the person who logged the time. */
  readonly authorAccountId: string;
  readonly timeSpentSeconds: number;
  readonly billableSeconds: number;
  /** Calendar day the work was done, `YYYY-MM-DD`. */
  readonly startDate: string;
  /** Wall-clock start on that day, `HH:MM:SS`, or null when Tempo omits it. */
  readonly startTime: string | null;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Filters accepted by {@link TempoClient.getWorklogs}. */
export interface TempoWorklogQuery {
  /** Inclusive start day, `YYYY-MM-DD`. */
  readonly from: string;
  /** Inclusive end day, `YYYY-MM-DD`. */
  readonly to: string;
  /** Numeric Jira issue ids to restrict to. */
  readonly issueIds?: readonly string[];
  /** Numeric Jira project ids to restrict to. */
  readonly projectIds?: readonly string[];
  /**
   * Restrict to one author.
   *
   * Routes the call to `worklogs/user/{accountId}`, which takes no issue or
   * project filter; callers that combine both must filter the result.
   */
  readonly authorAccountId?: string;
}
