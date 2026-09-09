// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Confluence module public API.
 */

export { ConfluenceConnector } from './connector.js';
export { ConfluenceInstancePool } from './instance-pool.js';
export type { PooledSite } from './instance-pool.js';
export { PageOperations } from './page-operations.js';
export type {
  ConfluenceAttachment,
  ConfluenceComment,
  ConfluenceLabel,
  ConfluencePage,
  ConfluencePageDetail,
  ConfluenceSearchHit,
  ConfluenceSpace,
  PageWriteResult,
} from './types.js';
