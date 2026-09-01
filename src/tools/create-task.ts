// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: create_task
 *
 * Creates a new Jira issue with optional description (markdown converted
 * to ADF), assignee, labels, priority, epic link, sub-task parent, and
 * original estimate.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';
import { markdownToAdf } from '../adf/markdown-to-adf.js';
import { parseTimeSpent } from '../connector/time-parser.js';
import { renderTemplate } from '../templates/renderer.js';
import type { TaskTemplateRegistry } from '../templates/task-registry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTaskArgs {
  readonly project_key: string;
  readonly summary: string;
  readonly description?: string;
  readonly template_id?: string;
  readonly variables?: Readonly<Record<string, string>>;
  readonly type?: string;
  readonly priority?: string;
  readonly assignee_email?: string;
  readonly labels?: readonly string[];
  readonly epic_key?: string;
  readonly parent_key?: string;
  readonly original_estimate?: string;
}

export interface CreateTaskDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
  readonly taskTemplateRegistry: TaskTemplateRegistry;
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
    const usingTemplate = args.template_id !== undefined;
    if (usingTemplate && (args.summary !== '' || args.description !== undefined)) {
      return failure(
        new Error(
          'When template_id is provided, do not also provide summary or description.',
        ),
      );
    }
    if (!usingTemplate && args.summary.trim() === '') {
      return failure(
        new Error(
          'Provide either template_id (with variables) or a non-empty summary.',
        ),
      );
    }

    const connector = deps.pool.getConnector(args.project_key);

    let effectiveSummary = args.summary;
    let effectiveDescription = args.description;
    let effectiveType = args.type;
    let effectivePriority = args.priority;
    let effectiveLabels = args.labels;
    let effectiveEpicKey = args.epic_key;
    let templateInfo: Record<string, unknown> | undefined;

    if (usingTemplate) {
      const template = deps.taskTemplateRegistry.getTemplate(args.template_id ?? '');

      const renderedSummary = renderTemplate(
        {
          id: template.id,
          name: `${template.name} Summary`,
          description: template.description,
          category: 'workflow',
          variables: template.variables,
          body: template.summary,
        },
        args.variables ?? {},
      );
      if (!renderedSummary.success) {
        return failure(new Error(renderedSummary.error));
      }

      const renderedDescription = renderTemplate(
        {
          id: template.id,
          name: template.name,
          description: template.description,
          category: 'workflow',
          variables: template.variables,
          body: template.body,
        },
        args.variables ?? {},
      );
      if (!renderedDescription.success) {
        return failure(new Error(renderedDescription.error));
      }

      effectiveSummary = renderedSummary.markdown;
      effectiveDescription =
        renderedDescription.markdown === '' ? undefined : renderedDescription.markdown;
      effectiveType = args.type ?? template.issueType;
      effectivePriority = args.priority ?? template.priority;
      effectiveLabels = args.labels ?? template.labels;
      effectiveEpicKey = args.epic_key ?? template.epicKey;
      templateInfo = {
        template_id: template.id,
        template_name: template.name,
        source: template.source ?? 'system',
      };
    }

    // Build core fields
    const fields: Record<string, unknown> = {
      project: { key: args.project_key },
      summary: effectiveSummary,
      issuetype: { name: effectiveType ?? 'Task' },
      priority: { name: effectivePriority ?? 'Medium' },
    };

    // Optional description (markdown -> ADF)
    if (effectiveDescription) {
      fields['description'] = markdownToAdf(effectiveDescription);
    }

    // Optional labels
    if (effectiveLabels && effectiveLabels.length > 0) {
      fields['labels'] = effectiveLabels;
    }

    // Optional assignee (email -> accountId)
    if (args.assignee_email) {
      const accountId = await connector.findUser(args.assignee_email);
      fields['assignee'] = { accountId };
    }

    // Optional sub-task parent (Jira rejects sub-task creation without it)
    if (args.parent_key) {
      fields['parent'] = { key: args.parent_key };
    }

    // Optional original estimate -- validated with the same rules as log_task_time
    if (args.original_estimate) {
      parseTimeSpent(args.original_estimate);
      fields['timetracking'] = { originalEstimate: args.original_estimate };
    }

    // Optional epic link
    if (effectiveEpicKey) {
      const epicFieldId = await resolveEpicLinkFieldId(connector);
      if (epicFieldId) {
        fields[epicFieldId] = effectiveEpicKey;
      }
    }

    // Create the issue
    const result = await connector.createIssue(fields);

    return success({
      issue_key: result.key,
      url: result.url,
      summary: effectiveSummary,
      ...(templateInfo ? { template: templateInfo } : {}),
      message: `Created ${result.key}: ${effectiveSummary}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
