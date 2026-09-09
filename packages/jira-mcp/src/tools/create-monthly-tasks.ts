// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: create_monthly_tasks
 *
 * Wraps the existing CLI {@link handleCreateMonthly} so that bulk monthly
 * admin tasks can be created (or previewed) over the MCP protocol.
 *
 * Inputs mirror the `jira-mcp create-monthly` CLI options:
 *  - `execute`: when true, run for real; otherwise dry-run preview.
 *  - `project`: optional case-insensitive project key filter.
 *
 * @module
 */

import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';
import {
  handleCreateMonthly,
  type CreateMonthlyDeps,
  type CreateMonthlyResult,
  type MonthlyConfigResult,
} from '../cli/commands/create-monthly.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateMonthlyTasksArgs {
  readonly execute?: boolean;
  readonly project?: string;
}

export interface CreateMonthlyTasksDeps {
  readonly createMonthlyDeps?: CreateMonthlyDeps;
}

// ---------------------------------------------------------------------------
// Output shaping
// ---------------------------------------------------------------------------

interface ConfigSummary {
  readonly project_key: string;
  readonly config_path: string;
  readonly status: 'success' | 'error';
  readonly error?: string;
  readonly summary?: {
    readonly created: number;
    readonly updated: number;
    readonly failed: number;
    readonly skipped: number;
    readonly previewed: number;
  };
  readonly dry_run?: boolean;
  /** Non-fatal per-task problems, e.g. a status the workflow rejected. */
  readonly warnings?: readonly string[];
}

function shapeConfig(config: MonthlyConfigResult): ConfigSummary {
  if (config.error) {
    return {
      project_key: config.projectKey,
      config_path: config.configPath,
      status: 'error',
      error: config.error,
    };
  }

  if (config.result) {
    const warnings = config.result.results
      .filter((task) => task.warning !== null)
      .map((task) => `${task.issue_key ?? task.summary}: ${task.warning ?? ''}`);

    return {
      project_key: config.projectKey,
      config_path: config.configPath,
      status: 'success',
      summary: config.result.summary,
      dry_run: config.result.dry_run,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  return {
    project_key: config.projectKey,
    config_path: config.configPath,
    status: 'error',
    error: 'No result and no error reported.',
  };
}

function shape(result: CreateMonthlyResult, executeRequested: boolean): Record<string, unknown> {
  return {
    execute: executeRequested,
    total_processed: result.totalProcessed,
    total_failed: result.totalFailed,
    total_succeeded: result.totalProcessed - result.totalFailed,
    configs: result.configs.map(shapeConfig),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Run the monthly bulk task creation pipeline and return a structured result.
 *
 * The handler delegates to {@link handleCreateMonthly}, which scans
 * `~/.softspark/jira-mcp/templates/tasks/<KEY>/monthly_admin.json` files,
 * validates them, replaces placeholders, and either previews or creates
 * the tasks in Jira.
 */
export async function handleCreateMonthlyTasks(
  args: CreateMonthlyTasksArgs,
  deps?: CreateMonthlyTasksDeps,
): Promise<ToolResult> {
  try {
    const result = await handleCreateMonthly(
      { execute: args.execute, project: args.project },
      deps?.createMonthlyDeps,
    );

    return success(shape(result, args.execute === true));
  } catch (err: unknown) {
    return failure(err);
  }
}
