// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * MCP tool response envelope, shared by every server in this workspace.
 *
 * Both the Jira and Confluence servers emit the same `{ success, ... }` shape
 * and the same `code` on failure, so a client that learned one has learned
 * the other.
 *
 * @module
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { JiraMcpError } from '../errors/index.js';

/** Re-export the SDK's CallToolResult as the standard tool return type. */
export type ToolResult = CallToolResult;

/**
 * Describes one MCP tool: name, description and JSON Schema input.
 *
 * Returned verbatim by each server's ListTools handler.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
  };
}

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
 * If the error is a {@link JiraMcpError}, its `code` is included; otherwise
 * the code defaults to `UNKNOWN_ERROR`.
 */
export function failure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof JiraMcpError ? error.code : 'UNKNOWN_ERROR';
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: false, error: message, code }, null, 2),
      },
    ],
    isError: true,
  };
}
