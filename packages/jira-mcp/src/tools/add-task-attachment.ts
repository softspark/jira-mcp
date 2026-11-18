// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handler: add_task_attachment
 *
 * Uploads a local file to a Jira task as an attachment. The task key prefix
 * picks the Jira instance, like every other task tool.
 *
 * @module
 */

import { isAbsolute } from 'node:path';

import { z } from 'zod';

import { parseToolArgs } from '@softspark/atlassian-mcp-core';

import type { InstancePool } from '../connector/instance-pool.js';
import type { JiraAttachment } from '../connector/types.js';
import { TaskKeySchema } from '../utils/task-key.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getAttachmentOperations } from './helpers.js';

export interface AddTaskAttachmentArgs {
  readonly task_key: string;
  readonly file_path: string;
  readonly filename?: string;
}

export interface AddTaskAttachmentDeps {
  readonly pool: InstancePool;
}

/**
 * Stored attachment name: a bare file name, never a path.
 *
 * Rejected rather than silently cut to a basename, so the caller learns the
 * name it asked for is not the name Jira would show.
 */
const FilenameSchema = z
  .string()
  .min(1, 'must not be empty')
  .max(255, 'must be at most 255 characters')
  .refine((name) => !/[\\/]/.test(name), {
    message: 'must be a bare file name without "/" or "\\"',
  })
  .refine((name) => name !== '.' && name !== '..', {
    message: 'must be a file name, not "." or ".."',
  })
  .refine((name) => !/\p{Cc}/u.test(name), {
    message: 'must not contain control characters',
  });

export const AddTaskAttachmentArgsSchema = z.object({
  task_key: TaskKeySchema,
  file_path: z.string().min(1).refine(isAbsolute, {
    message:
      'must be an absolute path; the MCP server does not run in your working directory',
  }),
  filename: FilenameSchema.optional(),
});

/** Snake-case view of an attachment, shared with `list_task_attachments`. */
export function formatAttachment(a: JiraAttachment): Record<string, unknown> {
  return {
    id: a.id,
    filename: a.filename,
    mime_type: a.mimeType,
    size: a.size,
    created: a.created,
    author: a.author,
    content_url: a.contentUrl,
  };
}

/**
 * Upload a local file to a Jira task.
 */
export async function handleAddTaskAttachment(
  args: AddTaskAttachmentArgs,
  deps: AddTaskAttachmentDeps,
): Promise<ToolResult> {
  try {
    const input = parseToolArgs(AddTaskAttachmentArgsSchema, args);

    const ops = getAttachmentOperations(deps.pool, input.task_key);
    const result = await ops.addAttachmentFromFile(
      input.task_key,
      input.file_path,
      input.filename,
    );

    const names = result.attachments.map((a) => `'${a.filename}'`).join(', ');
    return success({
      task_key: result.taskKey,
      attachments: result.attachments.map(formatAttachment),
      message: `Attached ${names} to ${result.taskKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
