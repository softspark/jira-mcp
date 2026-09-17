// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Connector module public API.
 */

export { JiraConnector } from './jira-connector.js';
export { InstancePool } from './instance-pool.js';
export type { PooledInstance } from './instance-pool.js';
export { TempoClient } from './tempo-client.js';
export type { TempoClientConfig } from './tempo-client.js';
export type { TempoWorklog, TempoWorklogQuery } from './tempo-types.js';
export { parseTimeSpent, formatTimeSpent } from './time-parser.js';
export type {
  JiraIssue,
  JiraIssueDetail,
  JiraComment,
  JiraTransition,
  JiraWorklog,
  JiraTimeTracking,
  JiraIssueRef,
  JiraProject,
} from './types.js';
