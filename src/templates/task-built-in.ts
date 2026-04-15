/**
 * Built-in single-task templates shipped with the Jira MCP server.
 *
 * These templates are stored as physical markdown files under
 * templates-system/task-templates/ and loaded at module initialization.
 */

import { SYSTEM_TASK_TEMPLATES_DIR } from '../config/paths.js';
import { loadTaskTemplatesFromDirectorySync } from './file-loaders.js';

export const BUILT_IN_TASK_TEMPLATES = loadTaskTemplatesFromDirectorySync(
  SYSTEM_TASK_TEMPLATES_DIR,
  'system',
);
