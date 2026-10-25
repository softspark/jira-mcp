// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: list_task_attachments
 *
 * Lists the attachments of a Jira task (metadata only), so an agent can check
 * that an upload landed. Binary content is never inlined into a tool result.
 *
 * @module
 */

import { z } from 'zod';

import { parseToolArgs } from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import { TaskKeySchema } from '../utils/task-key.js';
import { formatAttachment } from './add-task-attachment.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getAttachmentOperations } from './helpers.js';

export interface ListTaskAttachmentsArgs {
  readonly task_key: string;
}

export interface ListTaskAttachmentsDeps {
  readonly pool: InstancePool;
}

export const ListTaskAttachmentsArgsSchema = z.object({
  task_key: TaskKeySchema,
});

/**
 * List the attachments of a Jira task.
 */
export async function handleListTaskAttachments(
  args: ListTaskAttachmentsArgs,
  deps: ListTaskAttachmentsDeps,
): Promise<ToolResult> {
  try {
    const input = parseToolArgs(ListTaskAttachmentsArgsSchema, args);

    const ops = getAttachmentOperations(deps.pool, input.task_key);
    const result = await ops.listAttachments(input.task_key);

    return success({
      task_key: result.taskKey,
      attachments: result.attachments.map(formatAttachment),
      message: `Found ${String(result.attachments.length)} attachment(s) on ${result.taskKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
