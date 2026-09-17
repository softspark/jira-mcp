// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: get_tempo_report
 *
 * Sums Tempo hours over a date range by project, user and/or task, in the
 * order the caller lists them. Answers "how many hours went into project X
 * last month, and from whom" in one call.
 *
 * @module
 */

import type { JiraConfig } from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import { assertGroupBy } from '../operations/tempo-operations.js';
import type { TempoGroupKey, TempoReportRow } from '../operations/types.js';
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

export interface GetTempoReportArgs {
  readonly from: string;
  readonly to: string;
  readonly group_by?: readonly string[];
  readonly project_key?: string;
  readonly task_key?: string;
  readonly user_email?: string;
}

export interface GetTempoReportDeps {
  readonly pool: InstancePool;
  readonly config: JiraConfig;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Grouping used when the caller names none: hours per project, per person. */
const DEFAULT_GROUP_BY: readonly TempoGroupKey[] = ['project', 'user'];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/** Flatten a row into the snake_case shape, dropping unset dimensions. */
function toRowWire(row: TempoReportRow): Readonly<Record<string, unknown>> {
  return {
    ...(row.project !== undefined ? { project: row.project } : {}),
    ...(row.user !== undefined
      ? { user: row.user, user_email: row.userEmail ?? null }
      : {}),
    ...(row.task !== undefined
      ? { task: row.task, summary: row.summary ?? '' }
      : {}),
    time_spent: row.timeSpent,
    hours: row.hours,
    time_spent_seconds: row.timeSpentSeconds,
    billable_seconds: row.billableSeconds,
    worklog_count: row.worklogCount,
  };
}

/**
 * Aggregate Tempo hours over a date range.
 */
export async function handleGetTempoReport(
  args: GetTempoReportArgs,
  deps: GetTempoReportDeps,
): Promise<ToolResult> {
  try {
    const groupBy = args.group_by ?? DEFAULT_GROUP_BY;
    assertGroupBy(groupBy);

    const projectKey = resolveTempoProjectKey(args, deps.config);
    const ops = getTempoOperations(deps.pool, projectKey);

    const report = await ops.report(
      {
        from: args.from,
        to: args.to,
        ...(args.project_key !== undefined ? { projectKey: args.project_key } : {}),
        ...(args.task_key !== undefined ? { taskKey: args.task_key } : {}),
        ...(args.user_email !== undefined ? { userEmail: args.user_email } : {}),
      },
      groupBy,
    );

    return success({
      from: report.from,
      to: report.to,
      group_by: report.groupBy,
      filters: {
        project_key: args.project_key ?? null,
        task_key: args.task_key ?? null,
        user_email: args.user_email ?? null,
      },
      total_time_spent: report.totalTimeSpent,
      total_hours: report.totalHours,
      total_seconds: report.totalSeconds,
      billable_seconds: report.billableSeconds,
      worklog_count: report.worklogCount,
      rows: report.rows.map(toRowWire),
      message: `${report.totalTimeSpent} logged in Tempo between ${report.from} and ${report.to} across ${String(report.rows.length)} row(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
