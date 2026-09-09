// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for page attachments.
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import type { ConfluenceDeps, ToolResult } from './helpers.js';
import { failure, getPageOperations, success } from './helpers.js';

/**
 * Largest file this tool will upload.
 *
 * The whole file is held in memory to build the multipart body, so the cap is
 * about this process rather than about what Confluence would accept. Anything
 * larger belongs in the browser upload.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------
// list_attachments
// ---------------------------------------------------------------------------

export interface ListAttachmentsArgs {
  readonly page_id: string;
  readonly space_key?: string;
  readonly limit?: number;
}

/**
 * List attachment metadata for a page.
 *
 * Returns names, sizes and download URLs. Binary content is never inlined
 * into a tool result.
 */
export async function handleListAttachments(
  args: ListAttachmentsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const attachments = await ops.listAttachments(args.page_id, args.limit);

    return success({
      page_id: args.page_id,
      attachments,
      message: `Found ${String(attachments.length)} attachment(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// upload_attachment
// ---------------------------------------------------------------------------

export interface UploadAttachmentArgs {
  readonly page_id: string;
  readonly file_path: string;
  readonly filename?: string;
  readonly media_type?: string;
  readonly comment?: string;
  readonly space_key?: string;
}

/** Reads a local file. Injectable so tests never touch the filesystem. */
export type FileReader = (path: string) => Promise<Buffer>;

export interface UploadAttachmentDeps extends ConfluenceDeps {
  readonly fileReader?: FileReader;
}

/**
 * Upload a local file as a page attachment.
 *
 * Re-uploading an existing filename adds a new version of that attachment
 * rather than failing. The stored name is always the basename of the path, so
 * a directory component in `filename` cannot alter where the file lands.
 */
export async function handleUploadAttachment(
  args: UploadAttachmentArgs,
  deps: UploadAttachmentDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);

    const absolutePath = resolve(args.file_path);
    const read = deps.fileReader ?? readFile;
    const buffer = await read(absolutePath);

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(
        `File is ${String(buffer.byteLength)} bytes, above the ${String(MAX_UPLOAD_BYTES)} byte upload limit. Attach it through the Confluence UI instead.`,
      );
    }

    const attachment = await ops.uploadAttachment({
      pageId: args.page_id,
      filename: basename(args.filename ?? absolutePath),
      content: Uint8Array.from(buffer),
      ...(args.media_type !== undefined ? { mediaType: args.media_type } : {}),
      ...(args.comment !== undefined ? { comment: args.comment } : {}),
    });

    return success({
      page_id: args.page_id,
      attachment,
      message: `Uploaded '${attachment.title}' to page ${args.page_id}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
