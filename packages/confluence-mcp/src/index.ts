// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Public API for @softspark/confluence-mcp.
 *
 * @module
 */

export {
  createConfluenceServer,
  startConfluenceServer,
  dispatchConfluenceTool,
  CONFLUENCE_TOOL_DEFINITIONS,
} from './server.js';
