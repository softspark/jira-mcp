// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Jira-specific utilities for MCP tool handlers.
 *
 * Response formatting lives in the shared core package so both servers emit
 * the same envelope; what stays here is the one thing that is genuinely
 * Jira's, namely resolving a task key to its operations object.
 *
 * @module
 */

import {
  failure,
  InvalidInputError,
  success,
  type ToolResult,
} from '@softspark/atlassian-mcp-core';

import type { JiraConfig } from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { AddCommentOptions } from '../operations/types.js';
import { TaskOperations } from '../operations/task-operations.js';
import { parseInternal, parseVisibility } from '../utils/visibility.js';
import { TempoOperations } from '../operations/tempo-operations.js';
import { AttachmentOperations } from '../operations/attachment-operations.js';

// Re-exported so the many tool handlers that import from here keep working.
export type { ToolResult };
export { success, failure };

/**
 * Create a {@link TaskOperations} instance for the Jira project that
 * owns the given task key.
 *
 * The correct connector is resolved via the {@link InstancePool}.
 */
export function getOperations(
  pool: InstancePool,
  cacheManager: CacheManager,
  taskKey: string,
): TaskOperations {
  const connector = pool.getConnectorForTask(taskKey);
  return new TaskOperations(connector, cacheManager);
}

/**
 * Validate a comment tool's `visibility` and `internal` and attach the
 * project's `default_comment`, the fallback for a missing `internal`.
 *
 * @throws {InvalidInputError} When either argument has the wrong shape.
 */
export function resolveCommentOptions(
  args: {
    readonly task_key: string;
    readonly visibility?: unknown;
    readonly internal?: unknown;
  },
  config: JiraConfig,
): AddCommentOptions {
  const visibility = parseVisibility(args.visibility);
  const internal = parseInternal(args.internal);
  const serviceDefault = config.projects[args.task_key.split('-')[0] ?? '']?.default_comment;
  return {
    ...(visibility ? { visibility } : {}),
    ...(internal !== undefined ? { internal } : {}),
    ...(serviceDefault ? { serviceDefault } : {}),
  };
}

/**
 * Create an {@link AttachmentOperations} instance for the Jira project that
 * owns the given task key. Attachments are not cached, so no cache manager.
 */
export function getAttachmentOperations(
  pool: InstancePool,
  taskKey: string,
): AttachmentOperations {
  return new AttachmentOperations(pool.getConnectorForTask(taskKey));
}

/**
 * Pick the project key that routes a Tempo call to a Jira site.
 *
 * A Tempo query may name a project, a task, both, or neither. The project
 * wins when given, the task's prefix comes next, and the configured default
 * project covers a site-wide query. A task outside the named project is a
 * caller error and never a silent re-route.
 */
export function resolveTempoProjectKey(
  args: { readonly project_key?: string; readonly task_key?: string },
  config: JiraConfig,
): string {
  if (args.project_key !== undefined) {
    if (
      args.task_key !== undefined &&
      !args.task_key.startsWith(`${args.project_key}-`)
    ) {
      throw new InvalidInputError(
        `Task '${args.task_key}' does not belong to project '${args.project_key}'.`,
      );
    }
    return args.project_key;
  }
  const prefix = args.task_key?.split('-')[0];
  if (prefix) {
    return prefix;
  }
  return config.default_project;
}

/**
 * Create a {@link TempoOperations} instance for the site that owns a project.
 *
 * Both clients come from the pool so a site's Jira connector and Tempo
 * client are always the pair configured for the same URL.
 */
export function getTempoOperations(
  pool: InstancePool,
  projectKey: string,
): TempoOperations {
  return new TempoOperations(
    pool.getTempoClient(projectKey),
    pool.getConnector(projectKey),
  );
}
