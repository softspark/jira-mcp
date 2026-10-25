// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the add_task_attachment tool handler.
 *
 * Runs the real operations layer against a mocked connector, so argument
 * validation, file checks and response formatting are covered together.
 * Files live in a fresh `os.tmpdir()` directory.
 */

import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigValidationError,
  IssueNotFoundError,
} from '@softspark/atlassian-mcp-core';

import { handleAddTaskAttachment } from '../../src/tools/add-task-attachment';
import { MAX_ATTACHMENT_BYTES } from '../../src/operations/attachment-operations';
import {
  asConnector,
  asPool,
  createAttachmentFixture,
  createMockConnector,
  createMockInstancePool,
} from '../fixtures/mocks';

function parseResult(result: {
  content: Array<{ type: string; text?: string }>;
}): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

describe('handleAddTaskAttachment', () => {
  let dir: string;
  let file: string;
  let connector: ReturnType<typeof createMockConnector>;
  let pool: ReturnType<typeof createMockInstancePool>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jira-mcp-attach-tool-'));
    file = join(dir, 'shot.png');
    await writeFile(file, Buffer.from([1, 2, 3, 4]));
    connector = createMockConnector();
    pool = createMockInstancePool();
    pool.getConnectorForTask.mockReturnValue(asConnector(connector));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uploads the file and returns the created attachment', async () => {
    connector.addAttachment.mockResolvedValue([createAttachmentFixture()]);

    const result = await handleAddTaskAttachment(
      { task_key: 'PROJ-1', file_path: file },
      { pool: asPool(pool) },
    );

    const parsed = parseResult(result);
    expect(result.isError).toBeUndefined();
    expect(parsed['success']).toBe(true);
    expect(parsed['task_key']).toBe('PROJ-1');
    expect(parsed['attachments']).toEqual([
      {
        id: '10000',
        filename: 'shot.png',
        mime_type: 'image/png',
        size: 4,
        created: '2026-10-25T10:00:00.000+0000',
        author: 'dev@example.com',
        content_url:
          'https://test.atlassian.net/rest/api/3/attachment/content/10000',
      },
    ]);
    expect(parsed['message']).toBe("Attached 'shot.png' to PROJ-1");
    expect(pool.getConnectorForTask).toHaveBeenCalledWith('PROJ-1');
    expect(connector.addAttachment).toHaveBeenCalledWith('PROJ-1', {
      filename: 'shot.png',
      content: Uint8Array.from([1, 2, 3, 4]),
      mediaType: 'image/png',
    });
  });

  it('passes an explicit filename through', async () => {
    connector.addAttachment.mockResolvedValue([
      createAttachmentFixture({ filename: 'evidence.pdf' }),
    ]);

    await handleAddTaskAttachment(
      { task_key: 'PROJ-1', file_path: file, filename: 'evidence.pdf' },
      { pool: asPool(pool) },
    );

    expect(connector.addAttachment).toHaveBeenCalledWith(
      'PROJ-1',
      expect.objectContaining({
        filename: 'evidence.pdf',
        mediaType: 'application/pdf',
      }),
    );
  });

  describe('input validation answers INVALID_INPUT and sends nothing', () => {
    it.each([
      ['a lower-case task key', { task_key: 'proj-1' }, 'task_key'],
      ['a task key without a number', { task_key: 'PROJ' }, 'task_key'],
      ['a relative file path', { file_path: 'shot.png' }, 'file_path'],
      ['a filename with a slash', { filename: '../etc/passwd' }, 'filename'],
      ['a filename with a backslash', { filename: 'a\\b.png' }, 'filename'],
      ['the filename ".."', { filename: '..' }, 'filename'],
      ['an empty filename', { filename: '' }, 'filename'],
      ['a filename with a control character', { filename: 'a\nb.png' }, 'filename'],
      ['a filename over 255 characters', { filename: `${'a'.repeat(252)}.png` }, 'filename'],
    ])('rejects %s', async (_label, override, field) => {
      const result = await handleAddTaskAttachment(
        { task_key: 'PROJ-1', file_path: file, ...override },
        { pool: asPool(pool) },
      );

      const parsed = parseResult(result);
      expect(result.isError).toBe(true);
      expect(parsed['code']).toBe('INVALID_INPUT');
      expect(String(parsed['error'])).toContain(`${field}:`);
      expect(pool.getConnectorForTask).not.toHaveBeenCalled();
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('rejects a missing file', async () => {
      const result = await handleAddTaskAttachment(
        { task_key: 'PROJ-1', file_path: join(dir, 'missing.png') },
        { pool: asPool(pool) },
      );

      const parsed = parseResult(result);
      expect(parsed['code']).toBe('INVALID_INPUT');
      expect(String(parsed['error'])).toContain('File not found');
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('rejects a file over 10 MB', async () => {
      const big = join(dir, 'big.zip');
      await writeFile(big, '');
      await truncate(big, MAX_ATTACHMENT_BYTES + 1);

      const result = await handleAddTaskAttachment(
        { task_key: 'PROJ-1', file_path: big },
        { pool: asPool(pool) },
      );

      const parsed = parseResult(result);
      expect(parsed['code']).toBe('INVALID_INPUT');
      expect(String(parsed['error'])).toContain('upload limit');
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('rejects a directory', async () => {
      const result = await handleAddTaskAttachment(
        { task_key: 'PROJ-1', file_path: dir },
        { pool: asPool(pool) },
      );

      expect(parseResult(result)['code']).toBe('INVALID_INPUT');
    });
  });

  it('answers CONFIG_VALIDATION when the project is not configured', async () => {
    pool.getConnectorForTask.mockImplementation(() => {
      throw new ConfigValidationError("Project 'NOPE' not found in configuration");
    });

    const result = await handleAddTaskAttachment(
      { task_key: 'NOPE-1', file_path: file },
      { pool: asPool(pool) },
    );

    expect(parseResult(result)['code']).toBe('CONFIG_VALIDATION');
  });

  it('carries the Jira error code back to the client', async () => {
    connector.addAttachment.mockRejectedValue(
      new IssueNotFoundError('Issue not found, or not visible to this account'),
    );

    const result = await handleAddTaskAttachment(
      { task_key: 'PROJ-404', file_path: file },
      { pool: asPool(pool) },
    );

    const parsed = parseResult(result);
    expect(result.isError).toBe(true);
    expect(parsed['code']).toBe('ISSUE_NOT_FOUND');
  });
});
