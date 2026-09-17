// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: search_tempo_worklogs
 *
 * Lists Tempo worklogs in a date range, optionally scoped to a project, a
 * task and/or a user, with issue keys and user names resolved through Jira.
 *
 * @module
 */

import type { JiraConfig } from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import { formatTimeSpent } from '../connector/time-parser.js';
import type { TempoWorklogEntry } from '../operations/types.js';
import type { ToolResult } from './helpers.js';
import {
  success,
  failure,
  getTempoOperations,
  resolveTempoProjectKey,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchTempoWorklogsArgs {
  readonly from: string;
  readonly to: string;
  readonly project_key?: string;
  readonly task_key?: string;
  readonly user_email?: string;
  readonly limit?: number;
}

export interface SearchTempoWorklogsDeps {
  readonly pool: InstancePool;
  readonly config: JiraConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Worklogs returned when the caller names no limit. */
const DEFAULT_LIMIT = 200;

/**
 * Most worklogs one response will carry.
 *
 * Each line is a few hundred bytes of JSON; past this the answer is a
 * report, and `get_tempo_report` exists for that.
 */
const MAX_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Flatten an entry into the snake_case shape every tool here returns. */
export function toWorklogWire(
  entry: TempoWorklogEntry,
): Readonly<Record<string, unknown>> {
  return {
    worklog_id: entry.worklogId,
    task_key: entry.taskKey,
    summary: entry.summary,
    project_key: entry.projectKey,
    user: {
      account_id: entry.user.accountId,
      display_name: entry.user.displayName,
      email: entry.user.email,
    },
    date: entry.date,
    start_time: entry.startTime,
    time_spent: entry.timeSpent,
    time_spent_seconds: entry.timeSpentSeconds,
    billable_seconds: entry.billableSeconds,
    description: entry.description,
  };
}

/**
 * List Tempo worklogs for a date range.
 *
 * The full match is fetched and summed so `total_time_spent` is right even
 * when `limit` trims the list; `truncated` says when it did.
 */
export async function handleSearchTempoWorklogs(
  args: SearchTempoWorklogsArgs,
  deps: SearchTempoWorklogsDeps,
): Promise<ToolResult> {
  try {
    const projectKey = resolveTempoProjectKey(args, deps.config);
    const ops = getTempoOperations(deps.pool, projectKey);

    const entries = await ops.searchWorklogs({
      from: args.from,
      to: args.to,
      ...(args.project_key !== undefined ? { projectKey: args.project_key } : {}),
      ...(args.task_key !== undefined ? { taskKey: args.task_key } : {}),
      ...(args.user_email !== undefined ? { userEmail: args.user_email } : {}),
    });

    const limit = Math.min(
      Math.max(1, Math.floor(args.limit ?? DEFAULT_LIMIT)),
      MAX_LIMIT,
    );
    const limited = entries.slice(0, limit);
    const totalSeconds = entries.reduce(
      (sum, e) => sum + e.timeSpentSeconds,
      0,
    );

    return success({
      from: args.from,
      to: args.to,
      filters: {
        project_key: args.project_key ?? null,
        task_key: args.task_key ?? null,
        user_email: args.user_email ?? null,
      },
      count: limited.length,
      total_available: entries.length,
      truncated: entries.length > limited.length,
      total_time_spent: formatTimeSpent(totalSeconds),
      total_seconds: totalSeconds,
      worklogs: limited.map(toWorklogWire),
      message: `Found ${String(entries.length)} Tempo worklog(s) between ${args.from} and ${args.to}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
