// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Cache module public API.
 */

export { CacheManager } from './manager.js';
export { TaskSyncer } from './syncer.js';
export type { JiraFetcher, JiraIssue, SyncOptions } from './syncer.js';
export type { TaskData, CacheMetadata, CacheData } from './types.js';
export {
  TaskDataSchema,
  CacheMetadataSchema,
  CacheDataSchema,
  CACHE_VERSION,
} from './types.js';
