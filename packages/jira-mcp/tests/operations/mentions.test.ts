// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `@email` mention resolution, alone and through addComment with
 * the real markdown-to-ADF converter.
 */

import { describe, it, expect, vi } from 'vitest';

import { JiraConnectionError } from '@softspark/atlassian-mcp-core';
import { createSimpleAdfDoc } from '@softspark/atlassian-mcp-core/test-fixtures';
import { resolveEmailMentions } from '../../src/operations/mentions';
import { TaskOperations } from '../../src/operations/task-operations';
import {
  createMockConnector,
  createMockCacheManager,
  asConnector,
  asCacheManager,
} from '../fixtures/mocks';

function fakeDirectory(ids: Record<string, string>) {
  return vi.fn((email: string) => {
    const id = ids[email];
    return id === undefined
      ? Promise.reject(new JiraConnectionError(`User not found for email: ${email}`))
      : Promise.resolve(id);
  });
}

describe('resolveEmailMentions', () => {
  it('rewrites @email to [~accountid:ID]', async () => {
    const findUser = fakeDirectory({ 'jan@firma.pl': 'acc-jan' });

    const result = await resolveEmailMentions('Cześć @jan@firma.pl, zerknij.', findUser);

    expect(result).toBe('Cześć [~accountid:acc-jan], zerknij.');
  });

  it('looks each address up once, case-insensitively', async () => {
    const findUser = fakeDirectory({ 'jan@firma.pl': 'acc-jan' });

    const result = await resolveEmailMentions('@jan@firma.pl and @Jan@Firma.PL', findUser);

    expect(result).toBe('[~accountid:acc-jan] and [~accountid:acc-jan]');
    expect(findUser).toHaveBeenCalledOnce();
  });

  it('makes no lookup when there is nothing to resolve', async () => {
    const findUser = fakeDirectory({});
    const plain = 'mail jan@firma.pl or ping @team';

    expect(await resolveEmailMentions(plain, findUser)).toBe(plain);
    expect(findUser).not.toHaveBeenCalled();
  });

  it('skips inline code, fenced blocks and escaped \\@', async () => {
    const findUser = fakeDirectory({ 'jan@firma.pl': 'acc-jan' });
    const markdown = [
      '`@jan@firma.pl` and \\@jan@firma.pl',
      '```',
      'git log --author=@jan@firma.pl',
      '```',
      'tail @jan@firma.pl.',
    ].join('\n');

    const result = await resolveEmailMentions(markdown, findUser);

    expect(result).toBe(
      [
        '`@jan@firma.pl` and \\@jan@firma.pl',
        '```',
        'git log --author=@jan@firma.pl',
        '```',
        'tail [~accountid:acc-jan].',
      ].join('\n'),
    );
  });

  it('fails instead of posting when an address is unknown', async () => {
    const findUser = fakeDirectory({});

    await expect(resolveEmailMentions('hi @ghost@firma.pl', findUser)).rejects.toThrow(
      /User not found for email: ghost@firma.pl/,
    );
  });
});

describe('TaskOperations.addComment mentions', () => {
  it('sends a mention node to Jira for @email and [~accountid:ID]', async () => {
    const connector = createMockConnector();
    connector.findUser.mockResolvedValue('acc-jan');
    connector.getProjectTypeKey.mockResolvedValue('software');
    connector.addComment.mockResolvedValue({
      id: 'c-1',
      author: 'me@example.com',
      authorAccountId: 'me',
      body: createSimpleAdfDoc('ok'),
      created: '2026-01-01T00:00:00.000Z',
      visibility: null,
    });
    const ops = new TaskOperations(asConnector(connector), asCacheManager(createMockCacheManager()));

    await ops.addComment('PROJ-1', 'Hi @jan@firma.pl and [~accountid:acc-ola]');

    expect(connector.findUser).toHaveBeenCalledWith('jan@firma.pl');
    const body = connector.addComment.mock.calls[0]?.[1] as {
      content: Array<{ content: unknown[] }>;
    };
    expect(body.content[0]?.content).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', attrs: { id: 'acc-jan' } },
      { type: 'text', text: ' and ' },
      { type: 'mention', attrs: { id: 'acc-ola' } },
    ]);
  });

  it('posts nothing when a mentioned address is unknown', async () => {
    const connector = createMockConnector();
    connector.findUser.mockRejectedValue(new JiraConnectionError('User not found for email: x@y.pl'));
    const ops = new TaskOperations(asConnector(connector), asCacheManager(createMockCacheManager()));

    await expect(ops.addComment('PROJ-1', 'Hi @x@y.pl')).rejects.toThrow(/User not found/);
    expect(connector.addComment).not.toHaveBeenCalled();
  });
});
