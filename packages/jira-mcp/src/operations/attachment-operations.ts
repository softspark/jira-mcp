// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Business logic for issue attachments.
 *
 * Turns a local file into an upload: checks it is a readable regular file
 * under the size cap, names it, picks its media type, and hands the bytes to
 * the connector. Attachments are not part of the task cache, so there is no
 * cache write here.
 *
 * @module
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { InvalidInputError } from '@softspark/atlassian-mcp-core';

import type { JiraConnector } from '../connector/jira-connector.js';
import { mediaTypeForFilename } from '../utils/media-type.js';
import type { AttachmentsResult } from './types.js';

/**
 * Largest file `add_task_attachment` uploads: 10 MiB.
 *
 * Jira Cloud itself accepts up to 1 GB per file by default (admin
 * configurable, 2 GB ceiling). This cap is about the MCP server, which holds
 * the whole file in memory to build the multipart body; screenshots, logs and
 * PDFs fit well under it, and anything bigger belongs in the browser upload.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Error codes Node sets on a failed `stat`/`readFile` that mean "fix the path". */
const PATH_ERROR_CODES: Readonly<Record<string, string>> = {
  ENOENT: 'File not found',
  ENOTDIR: 'File not found',
  EACCES: 'Permission denied reading',
  EPERM: 'Permission denied reading',
};

function pathError(error: unknown, filePath: string): InvalidInputError | null {
  if (!(error instanceof Error) || !('code' in error)) {
    return null;
  }
  const code = (error as NodeJS.ErrnoException).code ?? '';
  const reason = PATH_ERROR_CODES[code];
  return reason === undefined
    ? null
    : new InvalidInputError(`${reason}: ${filePath}`);
}

function tooLarge(size: number, filePath: string): InvalidInputError {
  return new InvalidInputError(
    `${filePath} is ${String(size)} bytes, above the ${String(MAX_ATTACHMENT_BYTES)} byte (10 MB) upload limit. Attach it through the Jira UI instead.`,
  );
}

export class AttachmentOperations {
  constructor(private readonly connector: JiraConnector) {}

  /**
   * Upload a local file to a task.
   *
   * @param filePath  Absolute path of the file to upload.
   * @param filename  Stored name; defaults to the file's basename.
   * @throws {InvalidInputError} Missing, unreadable, non-regular or oversized file.
   */
  async addAttachmentFromFile(
    taskKey: string,
    filePath: string,
    filename?: string,
  ): Promise<AttachmentsResult> {
    const content = await this.#readUploadableFile(filePath);
    const storedName = filename ?? basename(filePath);

    const attachments = await this.connector.addAttachment(taskKey, {
      filename: storedName,
      content,
      mediaType: mediaTypeForFilename(storedName),
    });

    return { taskKey, attachments };
  }

  /** List the attachments of a task. */
  async listAttachments(taskKey: string): Promise<AttachmentsResult> {
    const attachments = await this.connector.getAttachments(taskKey);
    return { taskKey, attachments };
  }

  /**
   * Read a file after checking it is a regular file under the cap.
   *
   * The size is checked on `stat` first so an oversized file is never read
   * into memory, then again on the bytes in case it grew in between.
   */
  async #readUploadableFile(filePath: string): Promise<Uint8Array<ArrayBuffer>> {
    let info;
    try {
      info = await stat(filePath);
    } catch (error: unknown) {
      throw pathError(error, filePath) ?? error;
    }

    if (!info.isFile()) {
      throw new InvalidInputError(
        `Not a regular file: ${filePath}. Pass the path of a single file.`,
      );
    }
    if (info.size > MAX_ATTACHMENT_BYTES) {
      throw tooLarge(info.size, filePath);
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch (error: unknown) {
      throw pathError(error, filePath) ?? error;
    }
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw tooLarge(buffer.byteLength, filePath);
    }

    return Uint8Array.from(buffer);
  }
}
