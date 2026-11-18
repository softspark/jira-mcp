// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the list_task_attachments tool handler.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { JiraPermissionError } from '@softspark/atlassian-mcp-core';

import { handleListTaskAttachments } from '../../src/tools/list-task-attachments';
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

describe('handleListTaskAttachments', () => {
  let connector: ReturnType<typeof createMockConnector>;
  let pool: ReturnType<typeof createMockInstancePool>;

  beforeEach(() => {
    connector = createMockConnector();
    pool = createMockInstancePool();
    pool.getConnectorForTask.mockReturnValue(asConnector(connector));
  });

  it('lists the attachments in snake case', async () => {
    connector.getAttachments.mockResolvedValue([
      createAttachmentFixture(),
      createAttachmentFixture({
        id: '10001',
        filename: 'log.txt',
        mimeType: 'text/plain',
        size: 120,
        author: null,
        authorAccountId: null,
      }),
    ]);

    const result = await handleListTaskAttachments(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['task_key']).toBe('PROJ-1');
    expect(parsed['message']).toBe('Found 2 attachment(s) on PROJ-1');
    const attachments = parsed['attachments'] as Record<string, unknown>[];
    expect(attachments).toHaveLength(2);
    expect(attachments[1]).toEqual({
      id: '10001',
      filename: 'log.txt',
      mime_type: 'text/plain',
      size: 120,
      created: '2026-10-25T10:00:00.000+0000',
      author: null,
      content_url:
        'https://test.atlassian.net/rest/api/3/attachment/content/10000',
    });
    expect(connector.getAttachments).toHaveBeenCalledWith('PROJ-1');
  });

  it('reports an empty list', async () => {
    connector.getAttachments.mockResolvedValue([]);

    const result = await handleListTaskAttachments(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool) },
    );

    const parsed = parseResult(result);
    expect(parsed['attachments']).toEqual([]);
    expect(parsed['message']).toBe('Found 0 attachment(s) on PROJ-1');
  });

  it('rejects a malformed task key with INVALID_INPUT', async () => {
    const result = await handleListTaskAttachments(
      { task_key: 'not a key' },
      { pool: asPool(pool) },
    );

    const parsed = parseResult(result);
    expect(result.isError).toBe(true);
    expect(parsed['code']).toBe('INVALID_INPUT');
    expect(connector.getAttachments).not.toHaveBeenCalled();
  });

  it('carries a Jira permission error back with its code', async () => {
    connector.getAttachments.mockRejectedValue(
      new JiraPermissionError('Permission denied'),
    );

    const result = await handleListTaskAttachments(
      { task_key: 'PROJ-1' },
      { pool: asPool(pool) },
    );

    expect(parseResult(result)['code']).toBe('JIRA_PERMISSION');
  });
});
