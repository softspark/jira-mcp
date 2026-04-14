/**
 * Tool handler: create_task
 *
 * Creates a new Jira issue with optional description (markdown converted
 * to ADF), assignee, labels, priority, and epic link.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';
import { markdownToAdf } from '../adf/markdown-to-adf.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTaskArgs {
  readonly project_key: string;
  readonly summary: string;
  readonly description?: string;
  readonly type?: string;
  readonly priority?: string;
  readonly assignee_email?: string;
  readonly labels?: readonly string[];
  readonly epic_key?: string;
}

export interface CreateTaskDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
}

// ---------------------------------------------------------------------------
// Epic link field discovery
// ---------------------------------------------------------------------------

/**
 * Discover the custom field ID used for the Epic Link on this Jira instance.
 *
 * The field ID varies across instances (commonly `customfield_10014`).
 * We look for a custom field whose name matches "Epic Link" (case-insensitive).
 */
async function resolveEpicLinkFieldId(
  connector: {
    readonly getFields: () => Promise<
      ReadonlyArray<{ readonly id: string; readonly name: string; readonly custom: boolean }>
    >;
  },
): Promise<string | undefined> {
  const fields = await connector.getFields();
  const epicField = fields.find(
    (f) => f.custom && f.name.toLowerCase() === 'epic link',
  );
  return epicField?.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Create a new Jira issue.
 */
export async function handleCreateTask(
  args: CreateTaskArgs,
  deps: CreateTaskDeps,
): Promise<ToolResult> {
  try {
    const connector = deps.pool.getConnector(args.project_key);

    // Build core fields
    const fields: Record<string, unknown> = {
      project: { key: args.project_key },
      summary: args.summary,
      issuetype: { name: args.type ?? 'Task' },
      priority: { name: args.priority ?? 'Medium' },
    };

    // Optional description (markdown -> ADF)
    if (args.description) {
      fields['description'] = markdownToAdf(args.description);
    }

    // Optional labels
    if (args.labels && args.labels.length > 0) {
      fields['labels'] = args.labels;
    }

    // Optional assignee (email -> accountId)
    if (args.assignee_email) {
      const accountId = await connector.findUser(args.assignee_email);
      fields['assignee'] = { accountId };
    }

    // Optional epic link
    if (args.epic_key) {
      const epicFieldId = await resolveEpicLinkFieldId(connector);
      if (epicFieldId) {
        fields[epicFieldId] = args.epic_key;
      }
    }

    // Create the issue
    const result = await connector.createIssue(fields);

    return success({
      issue_key: result.key,
      url: result.url,
      summary: args.summary,
      message: `Created ${result.key}: ${args.summary}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
