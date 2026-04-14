/**
 * Tool handler: update_task
 *
 * Updates an existing Jira issue's fields: summary, description,
 * priority, or labels. Only provided fields are changed.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';
import { markdownToAdf } from '../adf/markdown-to-adf.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateTaskArgs {
  readonly task_key: string;
  readonly summary?: string;
  readonly description?: string;
  readonly priority?: string;
  readonly labels?: readonly string[];
}

export interface UpdateTaskDeps {
  readonly pool: InstancePool;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Update an existing Jira issue.
 *
 * Only the fields that are provided will be modified.
 */
export async function handleUpdateTask(
  args: UpdateTaskArgs,
  deps: UpdateTaskDeps,
): Promise<ToolResult> {
  try {
    const projectKey = args.task_key.split('-')[0] ?? '';
    const connector = deps.pool.getConnector(projectKey);

    const fields: Record<string, unknown> = {};

    if (args.summary !== undefined) {
      fields['summary'] = args.summary;
    }

    if (args.description !== undefined) {
      fields['description'] = markdownToAdf(args.description);
    }

    if (args.priority !== undefined) {
      fields['priority'] = { name: args.priority };
    }

    if (args.labels !== undefined) {
      fields['labels'] = args.labels;
    }

    if (Object.keys(fields).length === 0) {
      return failure(new Error('No fields to update. Provide at least one of: summary, description, priority, labels.'));
    }

    await connector.updateIssue(args.task_key, fields);

    const updatedFields = Object.keys(fields).join(', ');
    return success({
      task_key: args.task_key,
      updated_fields: updatedFields,
      message: `Updated ${args.task_key}: ${updatedFields}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
