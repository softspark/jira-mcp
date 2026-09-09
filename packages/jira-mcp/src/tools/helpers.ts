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
  success,
  type ToolResult,
} from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import { TaskOperations } from '../operations/task-operations.js';

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
