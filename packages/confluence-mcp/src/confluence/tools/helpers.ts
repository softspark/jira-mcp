// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Shared utilities for Confluence MCP tool handlers.
 *
 * Response formatting is reused from the Jira tool helpers so both servers
 * emit the same `{ success, ... }` envelope and the same error codes.
 *
 * @module
 */

import type { BodyFormat, ConfluenceConfig } from '@softspark/atlassian-mcp-core';
import type { ToolResult } from '@softspark/atlassian-mcp-core';
import { failure, success } from '@softspark/atlassian-mcp-core';
import type { ConfluenceInstancePool } from '../instance-pool.js';
import { PageOperations } from '../page-operations.js';

export type { ToolResult };
export { success, failure };

/** Dependencies every Confluence tool handler receives. */
export interface ConfluenceDeps {
  readonly pool: ConfluenceInstancePool;
  readonly config: ConfluenceConfig;
}

/**
 * Create {@link PageOperations} for the space a call targets.
 *
 * Returns the resolved space key alongside the operations, because handlers
 * need it for the language lookup and for messages that name the space the
 * caller did not type.
 */
export function getPageOperations(
  deps: ConfluenceDeps,
  spaceKey?: string,
): readonly [string, PageOperations] {
  const resolvedKey = deps.pool.resolveSpaceKey(spaceKey);
  const connector = deps.pool.getConnector(resolvedKey);
  return [
    resolvedKey,
    new PageOperations(connector, formatForSpace(deps.config, resolvedKey)),
  ] as const;
}

/**
 * Resolve the body format configured for a space.
 *
 * `storage` marks a space whose pages are Confluence XHTML: reads return that
 * XHTML and markdown writes are refused, because converting would delete every
 * macro and page link the space depends on.
 */
export function formatForSpace(
  config: ConfluenceConfig,
  spaceKey: string,
): BodyFormat {
  return config.spaces[spaceKey]?.format ?? config.default_format;
}

/**
 * Resolve the content language configured for a space.
 *
 * Mirrors the Jira `get_project_language` contract: content written into a
 * space follows the space's language, not the assistant's default.
 */
export function languageForSpace(
  config: ConfluenceConfig,
  spaceKey: string,
): string {
  return config.spaces[spaceKey]?.language ?? config.default_language;
}
