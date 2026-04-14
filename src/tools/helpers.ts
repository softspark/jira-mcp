/**
 * Shared utilities for MCP tool handlers.
 *
 * Provides consistent success/failure response formatting and
 * a convenience accessor for obtaining {@link TaskOperations}
 * from the instance pool.
 *
 * @module
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import { TaskOperations } from '../operations/task-operations.js';
import { JiraMcpError } from '../errors/index.js';

// ---------------------------------------------------------------------------
// Response type alias
// ---------------------------------------------------------------------------

/** Re-export the SDK's CallToolResult as the standard tool return type. */
export type ToolResult = CallToolResult;

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/**
 * Build a success response wrapping the given data payload.
 *
 * The payload is JSON-serialised with `success: true` prepended.
 */
export function success(data: Readonly<Record<string, unknown>>): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, ...data }, null, 2),
      },
    ],
  };
}

/**
 * Build an error response from an unknown thrown value.
 *
 * If the error is a {@link JiraMcpError}, its `code` is included;
 * otherwise the code defaults to `UNKNOWN_ERROR`.
 */
export function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof JiraMcpError ? error.code : 'UNKNOWN_ERROR';
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          { success: false, error: message, code },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Operations factory
// ---------------------------------------------------------------------------

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
