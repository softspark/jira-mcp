/**
 * Bulk task creation module.
 *
 * Provides types, validation schemas, placeholder replacement, and result
 * formatting for batch Jira task creation under an epic.
 */

export type {
  TaskConfig,
  BulkOptions,
  BulkConfig,
  TaskResult,
  BulkResult,
  TaskAction,
} from './types.js';

export {
  TaskConfigSchema,
  BulkOptionsSchema,
  BulkConfigSchema,
} from './schema.js';
export type { ParsedBulkConfig } from './schema.js';

export { getCurrentPlaceholders, replacePlaceholders } from './placeholder.js';
export type { PlaceholderValues } from './placeholder.js';

export { formatBulkResult, formatTaskResult } from './result-formatter.js';

export { BulkTaskCreator, EpicNotFoundError, EpicLinkFieldNotFoundError } from './bulk-task-creator.js';
