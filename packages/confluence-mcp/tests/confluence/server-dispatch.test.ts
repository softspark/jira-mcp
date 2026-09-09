// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Dispatch tests for the Confluence MCP server.
 *
 * Drives every registered tool through `dispatchConfluenceTool` with a faked
 * connector, checking argument plumbing, the approval guards, and that the
 * declared tool surface matches what dispatch actually routes.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

import {
  CONFLUENCE_TOOL_DEFINITIONS,
  dispatchConfluenceTool,
} from '../../src/server';
import { ConfluenceInstancePool } from '../../src/confluence/instance-pool';
import type { ConfluenceConfig } from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps } from '../../src/confluence/tools/helpers';

// __PKG_VERSION__ is injected at build time by tsup, not present under vitest.
vi.mock('../../src/version.js', () => ({
  VERSION: '1.0.0-test',
}));

const CONFIG: ConfluenceConfig = {
  spaces: {
    DOCS: {
      url: 'https://test.atlassian.net',
      username: 'user@example.com',
      api_token: 'token',
      language: 'pl',
      format: 'markdown',
    },
  },
  default_space: 'DOCS',
  default_language: 'en',
  default_format: 'markdown',
  credentials: { username: 'user@example.com', api_token: 'token' },
};

const ADF_HELLO = {
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
};

/** Parse the JSON envelope every handler returns. */
function payload(result: {
  content: readonly { readonly text?: string }[];
}): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('dispatchConfluenceTool', () => {
  let deps: ConfluenceDeps;
  let connector: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const pool = new ConfluenceInstancePool(CONFIG);

    connector = {
      listSpaces: vi.fn().mockResolvedValue([{ id: '1', key: 'DOCS' }]),
      resolveSpaceId: vi.fn().mockResolvedValue('77'),
      searchPages: vi.fn().mockResolvedValue([{ id: '9', title: 'Hit' }]),
      getPage: vi.fn().mockResolvedValue({
        page: { id: '123', title: 'Page', status: 'current', version: 3 },
        adf: ADF_HELLO,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
      getChildPages: vi.fn().mockResolvedValue([{ id: '5' }]),
      getSpacePages: vi.fn().mockResolvedValue([{ id: '5' }]),
      createPage: vi
        .fn()
        .mockResolvedValue({ id: '900', title: 'New', version: 1 }),
      updatePage: vi
        .fn()
        .mockResolvedValue({ id: '123', title: 'Page', version: 4 }),
      movePage: vi
        .fn()
        .mockResolvedValue({ id: '123', title: 'Page', version: 4 }),
      deletePage: vi.fn().mockResolvedValue(undefined),
      getFooterComments: vi.fn().mockResolvedValue([]),
      addFooterComment: vi.fn().mockResolvedValue({ id: 'c1', version: 1 }),
      deleteFooterComment: vi.fn().mockResolvedValue(undefined),
      movePageToTarget: vi.fn().mockResolvedValue({ pageId: '123' }),
      getInlineComments: vi.fn().mockResolvedValue([]),
      addInlineComment: vi
        .fn()
        .mockResolvedValue({ id: 'ic1', version: 1, body: '' }),
      getSpaceBlogPosts: vi.fn().mockResolvedValue([{ id: '500' }]),
      getBlogPost: vi.fn().mockResolvedValue({
        post: { id: '500', title: 'News', status: 'current', version: 2 },
        adf: ADF_HELLO,
      }),
      createBlogPost: vi
        .fn()
        .mockResolvedValue({ id: '500', title: 'News', version: 1 }),
      updateBlogPost: vi
        .fn()
        .mockResolvedValue({ id: '500', title: 'News', version: 3 }),
      deleteBlogPost: vi.fn().mockResolvedValue(undefined),
      getRestrictions: vi
        .fn()
        .mockResolvedValue({ read: { users: [], groups: [] }, update: { users: [], groups: [] } }),
      setRestrictions: vi
        .fn()
        .mockResolvedValue({ read: { users: [], groups: [] }, update: { users: [], groups: [] } }),
      getWhiteboard: vi.fn().mockResolvedValue({ id: 'wb1', title: 'Retro' }),
      createWhiteboard: vi
        .fn()
        .mockResolvedValue({ id: 'wb1', title: 'Retro' }),
      deleteWhiteboard: vi.fn().mockResolvedValue(undefined),
      addLabels: vi.fn().mockResolvedValue([{ id: '1', name: 'runbook' }]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
      listAttachments: vi.fn().mockResolvedValue([]),
      uploadAttachment: vi
        .fn()
        .mockResolvedValue({ id: 'a1', title: 'f.txt', version: 1 }),
    };

    // Replace the pooled connector with the double.
    vi.spyOn(pool, 'getConnector').mockReturnValue(
      connector as never,
    );

    deps = { pool, config: CONFIG };
  });

  // -----------------------------------------------------------------------
  // Surface
  // -----------------------------------------------------------------------

  describe('tool surface', () => {
    it('routes every declared tool', async () => {
      const unroutable: string[] = [];

      for (const def of CONFLUENCE_TOOL_DEFINITIONS) {
        const result = await dispatchConfluenceTool(def.name, {}, deps);
        const body = payload(result);
        if (body['error'] === `Unknown tool: ${def.name}`) {
          unroutable.push(def.name);
        }
      }

      expect(unroutable).toEqual([]);
    });

    it('declares unique tool names', () => {
      const names = CONFLUENCE_TOOL_DEFINITIONS.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    });

    // Collisions with the Jira server's tool names are a property of the pair
    // of packages, asserted in core/tests/tool-name-collisions.test.ts.

    it('reports an unknown tool as an error', async () => {
      const result = await dispatchConfluenceTool('nope', {}, deps);

      expect(payload(result)['error']).toBe('Unknown tool: nope');
    });
  });

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  describe('read tools', () => {
    it('list_spaces reports configured keys alongside site spaces', async () => {
      const body = payload(await dispatchConfluenceTool('list_spaces', {}, deps));

      expect(body['success']).toBe(true);
      expect(body['configured_spaces']).toEqual([
        { key: 'DOCS', language: 'pl', body_format: 'markdown' },
      ]);
      expect(body['default_space']).toBe('DOCS');
    });

    it('get_space_language returns the per-space language, not the global one', async () => {
      const body = payload(
        await dispatchConfluenceTool('get_space_language', {}, deps),
      );

      expect(body['language']).toBe('pl');
      expect(body['space_key']).toBe('DOCS');
    });

    it('search_pages wraps plain text into an escaped CQL clause', async () => {
      await dispatchConfluenceTool(
        'search_pages',
        { text: 'say "hi"' },
        deps,
      );

      expect(connector['searchPages']).toHaveBeenCalledWith(
        'space = "DOCS" AND (text ~ "say \\"hi\\"")',
        undefined,
      );
    });

    it('search_pages honours a raw CQL query over text', async () => {
      await dispatchConfluenceTool(
        'search_pages',
        { text: 'ignored', cql: 'label = "x"' },
        deps,
      );

      expect(connector['searchPages']).toHaveBeenCalledWith(
        'space = "DOCS" AND (label = "x")',
        undefined,
      );
    });

    it('search_pages skips the space scope when all_spaces is set', async () => {
      await dispatchConfluenceTool(
        'search_pages',
        { text: 'x', all_spaces: true },
        deps,
      );

      expect(connector['searchPages']).toHaveBeenCalledWith(
        'text ~ "x"',
        undefined,
      );
    });

    it('search_pages refuses an empty all-spaces search', async () => {
      const body = payload(
        await dispatchConfluenceTool('search_pages', { all_spaces: true }, deps),
      );

      expect(body['success']).toBe(false);
    });

    it('get_page returns markdown and the space language', async () => {
      const body = payload(
        await dispatchConfluenceTool('get_page', { page_id: '123' }, deps),
      );

      const page = body['page'] as { body: string; version: number };
      expect(page.body).toContain('Hi');
      expect(page.version).toBe(3);
      expect(body['language']).toBe('pl');
    });

    it('get_page requires page_id', async () => {
      const body = payload(await dispatchConfluenceTool('get_page', {}, deps));

      expect(body['error']).toMatch(/page_id/);
    });

    it('get_page_children walks the tree', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'get_page_children',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['parent_id']).toBe('123');
      expect(connector['getChildPages']).toHaveBeenCalledWith('123', undefined);
    });

    it('list_space_pages resolves the space id first', async () => {
      await dispatchConfluenceTool('list_space_pages', {}, deps);

      expect(connector['resolveSpaceId']).toHaveBeenCalledWith('DOCS');
    });
  });

  // -----------------------------------------------------------------------
  // Writes
  // -----------------------------------------------------------------------

  describe('write tools', () => {
    it('create_page passes markdown through the ADF conversion', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'create_page',
          { title: 'New', content: '# Head' },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(body['space_key']).toBe('DOCS');
      const call = connector['createPage']?.mock.calls[0]?.[0] as {
        adf: { type: string };
      };
      expect(call.adf.type).toBe('doc');
    });

    it('update_page refuses a call that changes nothing', async () => {
      const body = payload(
        await dispatchConfluenceTool('update_page', { page_id: '1' }, deps),
      );

      expect(body['success']).toBe(false);
      expect(body['error']).toMatch(/Nothing to update/);
    });

    it('update_page sends the version message', async () => {
      await dispatchConfluenceTool(
        'update_page',
        { page_id: '123', content: 'x', version_message: 'why' },
        deps,
      );

      const call = connector['updatePage']?.mock.calls[0]?.[0] as {
        versionMessage: string;
      };
      expect(call.versionMessage).toBe('why');
    });

    it('move_page requires a parent', async () => {
      const body = payload(
        await dispatchConfluenceTool('move_page', { page_id: '1' }, deps),
      );

      expect(body['error']).toMatch(/parent_id/);
    });

    it('move_page rejects an unknown position instead of guessing', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'move_page',
          { page_id: '1', parent_id: '2', position: 'sideways' },
          deps,
        ),
      );

      expect(body['success']).toBe(false);
      expect(body['error']).toMatch(/Invalid position/);
    });

    it('move_page across spaces uses the v1 content-tree endpoint', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'move_page',
          { page_id: '123', parent_id: '999', cross_space: true },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(connector['movePageToTarget']).toHaveBeenCalledWith(
        '123',
        'append',
        '999',
      );
      expect(connector['updatePage']).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Blog posts
  // -----------------------------------------------------------------------

  describe('blog posts', () => {
    it('list_blog_posts resolves the space id first', async () => {
      const body = payload(
        await dispatchConfluenceTool('list_blog_posts', {}, deps),
      );

      expect(body['success']).toBe(true);
      expect(connector['resolveSpaceId']).toHaveBeenCalledWith('DOCS');
    });

    it('get_blog_post returns markdown and the space language', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'get_blog_post',
          { blog_post_id: '500' },
          deps,
        ),
      );

      const post = body['blog_post'] as { body: string };
      expect(post.body).toContain('Hi');
      expect(body['language']).toBe('pl');
    });

    it('create_blog_post converts markdown to ADF', async () => {
      await dispatchConfluenceTool(
        'create_blog_post',
        { title: 'News', content: '# Head' },
        deps,
      );

      const call = connector['createBlogPost']?.mock.calls[0]?.[0] as {
        adf: { type: string };
      };
      expect(call.adf.type).toBe('doc');
    });

    it('update_blog_post refuses a call that changes nothing', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'update_blog_post',
          { blog_post_id: '500' },
          deps,
        ),
      );

      expect(body['error']).toMatch(/Nothing to update/);
    });

    it('delete_blog_post refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_blog_post',
          { blog_post_id: '500' },
          deps,
        ),
      );

      expect(body['code']).toBe('DELETION_APPROVAL_REQUIRED');
      expect(connector['deleteBlogPost']).not.toHaveBeenCalled();
    });

    it('delete_blog_post proceeds with user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_blog_post',
          { blog_post_id: '500', user_approved: true },
          deps,
        ),
      );

      expect(body['title']).toBe('News');
    });
  });

  // -----------------------------------------------------------------------
  // Inline comments
  // -----------------------------------------------------------------------

  describe('inline comments', () => {
    it('get_page_inline_comments counts unresolved threads', async () => {
      connector['getInlineComments']?.mockResolvedValue([
        {
          comment: { id: 'ic1', version: 1, body: '', resolutionStatus: 'open' },
          adf: ADF_HELLO,
        },
        {
          comment: {
            id: 'ic2',
            version: 1,
            body: '',
            resolutionStatus: 'resolved',
          },
          adf: ADF_HELLO,
        },
      ]);

      const body = payload(
        await dispatchConfluenceTool(
          'get_page_inline_comments',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['unresolved_count']).toBe(1);
    });

    it('add_page_inline_comment refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_inline_comment',
          { page_id: '123', comment: 'x', text_selection: 'Hi' },
          deps,
        ),
      );

      expect(body['code']).toBe('COMMENT_APPROVAL_REQUIRED');
    });

    it('add_page_inline_comment anchors to text present on the page', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_inline_comment',
          {
            page_id: '123',
            comment: 'looks wrong',
            text_selection: 'Hi',
            user_approved: true,
          },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(connector['addInlineComment']).toHaveBeenCalledWith(
        expect.objectContaining({ textSelection: 'Hi', matchCount: 1 }),
      );
    });

    it('add_page_inline_comment rejects an anchor that is not on the page', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_inline_comment',
          {
            page_id: '123',
            comment: 'x',
            text_selection: 'absent phrase',
            user_approved: true,
          },
          deps,
        ),
      );

      expect(body['success']).toBe(false);
      expect(body['error']).toMatch(/does not appear in page/);
      expect(connector['addInlineComment']).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Restrictions
  // -----------------------------------------------------------------------

  describe('restrictions', () => {
    it('get_page_restrictions distinguishes "no restrictions" from "no access"', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'get_page_restrictions',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['inherits_space_permissions']).toBe(true);
      expect(body['message']).toMatch(/inherits space permissions/);
    });

    it('get_page_restrictions reports an explicitly restricted page', async () => {
      connector['getRestrictions']?.mockResolvedValue({
        read: { users: [{ accountId: 'a1' }], groups: [] },
        update: { users: [], groups: [] },
      });

      const body = payload(
        await dispatchConfluenceTool(
          'get_page_restrictions',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['inherits_space_permissions']).toBe(false);
    });

    it('set_page_restrictions refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'set_page_restrictions',
          { page_id: '123', read_account_ids: ['a1'] },
          deps,
        ),
      );

      expect(body['code']).toBe('COMMENT_APPROVAL_REQUIRED');
      expect(connector['setRestrictions']).not.toHaveBeenCalled();
    });

    it('set_page_restrictions treats missing lists as empty, not as "keep"', async () => {
      await dispatchConfluenceTool(
        'set_page_restrictions',
        { page_id: '123', read_account_ids: ['a1'], user_approved: true },
        deps,
      );

      expect(connector['setRestrictions']).toHaveBeenCalledWith('123', {
        readAccountIds: ['a1'],
        readGroupIds: [],
        updateAccountIds: [],
        updateGroupIds: [],
      });
    });

    it('set_page_restrictions says so when it cleared the restrictions', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'set_page_restrictions',
          { page_id: '123', user_approved: true },
          deps,
        ),
      );

      expect(body['message']).toMatch(/Cleared restrictions/);
    });
  });

  // -----------------------------------------------------------------------
  // Whiteboards
  // -----------------------------------------------------------------------

  describe('whiteboards', () => {
    it('get_whiteboard states that content is unavailable', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'get_whiteboard',
          { whiteboard_id: 'wb1' },
          deps,
        ),
      );

      expect(body['content_available']).toBe(false);
      expect(body['message']).toMatch(/not exposed by the API/);
    });

    it('create_whiteboard says the board is empty', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'create_whiteboard',
          { title: 'Retro' },
          deps,
        ),
      );

      expect(body['message']).toMatch(/empty whiteboard/);
    });

    it('delete_whiteboard refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_whiteboard',
          { whiteboard_id: 'wb1' },
          deps,
        ),
      );

      expect(body['code']).toBe('DELETION_APPROVAL_REQUIRED');
    });

    it('delete_whiteboard proceeds with user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_whiteboard',
          { whiteboard_id: 'wb1', user_approved: true },
          deps,
        ),
      );

      expect(body['title']).toBe('Retro');
    });
  });

  // -----------------------------------------------------------------------
  // Guards
  // -----------------------------------------------------------------------

  describe('approval guards', () => {
    it('delete_page refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool('delete_page', { page_id: '123' }, deps),
      );

      expect(body['code']).toBe('DELETION_APPROVAL_REQUIRED');
      expect(connector['deletePage']).not.toHaveBeenCalled();
    });

    it('delete_page proceeds with user_approved and reports the title', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_page',
          { page_id: '123', user_approved: true },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(body['title']).toBe('Page');
      expect(connector['deletePage']).toHaveBeenCalledWith('123');
    });

    it('add_page_comment refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_comment',
          { page_id: '123', comment: 'hi' },
          deps,
        ),
      );

      expect(body['code']).toBe('COMMENT_APPROVAL_REQUIRED');
      expect(connector['addFooterComment']).not.toHaveBeenCalled();
    });

    it('add_page_comment proceeds with user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_comment',
          { page_id: '123', comment: 'hi', user_approved: true },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
    });

    it('delete_page_comment refuses without user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_page_comment',
          { comment_id: 'c1' },
          deps,
        ),
      );

      expect(body['code']).toBe('DELETION_APPROVAL_REQUIRED');
    });

    it('delete_page_comment proceeds with user_approved', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'delete_page_comment',
          { comment_id: 'c1', user_approved: true },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(connector['deleteFooterComment']).toHaveBeenCalledWith('c1');
    });
  });

  // -----------------------------------------------------------------------
  // Comment reads
  // -----------------------------------------------------------------------

  describe('get_page_comments', () => {
    it('returns markdown bodies and the space language', async () => {
      connector['getFooterComments']?.mockResolvedValue([
        { comment: { id: 'c1', version: 1, body: '' }, adf: ADF_HELLO },
      ]);

      const body = payload(
        await dispatchConfluenceTool(
          'get_page_comments',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(body['language']).toBe('pl');
      const comments = body['comments'] as { body: string }[];
      expect(comments[0]?.body).toContain('Hi');
    });

    it('surfaces a connector failure as an error envelope', async () => {
      connector['getFooterComments']?.mockRejectedValue(
        new Error('site unreachable'),
      );

      const body = payload(
        await dispatchConfluenceTool(
          'get_page_comments',
          { page_id: '123' },
          deps,
        ),
      );

      expect(body['success']).toBe(false);
      expect(body['error']).toBe('site unreachable');
    });
  });

  // -----------------------------------------------------------------------
  // Labels and attachments
  // -----------------------------------------------------------------------

  describe('labels and attachments', () => {
    it('add_page_labels rejects an empty list', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'add_page_labels',
          { page_id: '1', labels: [] },
          deps,
        ),
      );

      expect(body['success']).toBe(false);
    });

    it('add_page_labels forwards the names', async () => {
      await dispatchConfluenceTool(
        'add_page_labels',
        { page_id: '1', labels: ['runbook', 'draft'] },
        deps,
      );

      expect(connector['addLabels']).toHaveBeenCalledWith('1', [
        'runbook',
        'draft',
      ]);
    });

    it('get_page_labels returns the labels on a page', async () => {
      connector['getLabels']?.mockResolvedValue([
        { id: '1', name: 'runbook' },
      ]);

      const body = payload(
        await dispatchConfluenceTool('get_page_labels', { page_id: '1' }, deps),
      );

      expect(body['success']).toBe(true);
      expect(body['labels']).toEqual([{ id: '1', name: 'runbook' }]);
      expect(connector['getLabels']).toHaveBeenCalledWith('1');
    });

    it('remove_page_label deletes the named label', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'remove_page_label',
          { page_id: '1', label: 'draft' },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(connector['removeLabel']).toHaveBeenCalledWith('1', 'draft');
    });

    it('remove_page_label needs a label name', async () => {
      const body = payload(
        await dispatchConfluenceTool('remove_page_label', { page_id: '1' }, deps),
      );

      expect(body['error']).toMatch(/label/);
    });

    it('list_attachments returns metadata only', async () => {
      const body = payload(
        await dispatchConfluenceTool(
          'list_attachments',
          { page_id: '1' },
          deps,
        ),
      );

      expect(body['success']).toBe(true);
      expect(body['attachments']).toEqual([]);
    });

    it('upload_attachment reads the file and uploads its bytes', async () => {
      const fileReader = vi.fn().mockResolvedValue(Buffer.from('hello'));
      const body = payload(
        await dispatchConfluenceTool(
          'upload_attachment',
          { page_id: '1', file_path: '/tmp/f.txt' },
          { ...deps, fileReader } as ConfluenceDeps,
        ),
      );

      expect(fileReader).toHaveBeenCalledWith('/tmp/f.txt');
      expect(body['success']).toBe(true);
    });

    it('upload_attachment rejects a file above the size cap', async () => {
      const fileReader = vi
        .fn()
        .mockResolvedValue(Buffer.alloc(26 * 1024 * 1024));
      const body = payload(
        await dispatchConfluenceTool(
          'upload_attachment',
          { page_id: '1', file_path: '/tmp/big.bin' },
          { ...deps, fileReader } as ConfluenceDeps,
        ),
      );

      expect(body['success']).toBe(false);
      expect(body['error']).toMatch(/upload limit/);
      expect(connector['uploadAttachment']).not.toHaveBeenCalled();
    });
  });
});
