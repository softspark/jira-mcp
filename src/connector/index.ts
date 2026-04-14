/**
 * Connector module public API.
 */

export { JiraConnector } from './jira-connector.js';
export { InstancePool } from './instance-pool.js';
export type { PooledInstance } from './instance-pool.js';
export { parseTimeSpent } from './time-parser.js';
export type {
  JiraIssue,
  JiraIssueDetail,
  JiraComment,
  JiraTransition,
  JiraWorklog,
  JiraTimeTracking,
} from './types.js';
