// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for PageOperations.
 *
 * Focused on the two things this layer owns and the connector does not:
 * the markdown boundary, and read-modify-write on update.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

import { MarkupLossError } from '@softspark/atlassian-mcp-core';

import { PageOperations } from '../../src/confluence/page-operations';
import type { ConfluenceConnector } from '../../src/confluence/connector';

const ADF_HELLO = {
  type: 'doc',
  version: 1,
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
  ],
};

/** Minimal connector double covering only the methods under test. */
function makeConnector(
  overrides: Partial<Record<keyof ConfluenceConnector, unknown>> = {},
): ConfluenceConnector {
  return {
    resolveSpaceId: vi.fn().mockResolvedValue('77'),
    getPage: vi.fn().mockResolvedValue({
      page: {
        id: '123',
        title: 'Existing title',
        status: 'current',
        version: 4,
      },
      adf: ADF_HELLO,
      storage: '<p>Hello</p>',
    }),
    getLabels: vi.fn().mockResolvedValue([{ id: '1', name: 'runbook' }]),
    createPage: vi
      .fn()
      .mockResolvedValue({ id: '900', title: 'New', version: 1 }),
    updatePage: vi
      .fn()
      .mockResolvedValue({ id: '123', title: 'T', version: 5 }),
    movePage: vi
      .fn()
      .mockResolvedValue({ id: '123', title: 'T', version: 5 }),
    deletePage: vi.fn().mockResolvedValue(undefined),
    getFooterComments: vi.fn().mockResolvedValue([]),
    addFooterComment: vi.fn().mockResolvedValue({ id: 'c1', version: 1, body: '' }),
    getSpacePages: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ConfluenceConnector;
}

describe('PageOperations', () => {
  let connector: ConfluenceConnector;
  let ops: PageOperations;

  beforeEach(() => {
    connector = makeConnector();
    ops = new PageOperations(connector);
  });

  describe('getPageDetail', () => {
    it('renders the ADF body as markdown and attaches labels', async () => {
      const detail = await ops.getPageDetail('123');

      expect(detail.body).toContain('Hello');
      expect(detail.labels).toHaveLength(1);
      expect(detail.version).toBe(4);
    });

    it('renders a missing body without throwing', async () => {
      ops = new PageOperations(
        makeConnector({
          getPage: vi.fn().mockResolvedValue({
            page: { id: '1', title: 'T', status: 'current', version: 1 },
            adf: null,
          }),
        }),
      );

      const detail = await ops.getPageDetail('1');

      expect(detail.body).toBe('(No content)');
    });
  });

  describe('createPage', () => {
    it('resolves the space key to an id and converts markdown to ADF', async () => {
      await ops.createPage({
        spaceKey: 'DOCS',
        title: 'New',
        markdown: '# Heading',
      });

      expect(connector.resolveSpaceId).toHaveBeenCalledWith('DOCS');
      const call = vi.mocked(connector.createPage).mock.calls[0]?.[0];
      expect(call?.spaceId).toBe('77');
      expect(call?.adf.type).toBe('doc');
      expect(call?.status).toBe('current');
    });

    it('creates a draft when asked', async () => {
      await ops.createPage({
        spaceKey: 'DOCS',
        title: 'New',
        markdown: 'x',
        draft: true,
      });

      expect(
        vi.mocked(connector.createPage).mock.calls[0]?.[0].status,
      ).toBe('draft');
    });
  });

  describe('updatePage read-modify-write', () => {
    it('keeps the current title when only the body changes', async () => {
      await ops.updatePage({ pageId: '123', markdown: 'new body' });

      const call = vi.mocked(connector.updatePage).mock.calls[0]?.[0];
      expect(call?.title).toBe('Existing title');
      expect(call?.version).toBe(4);
    });

    it('writes the current body back untouched when only the title changes', async () => {
      await ops.updatePage({ pageId: '123', title: 'Renamed' });

      const call = vi.mocked(connector.updatePage).mock.calls[0]?.[0];
      expect(call?.title).toBe('Renamed');
      // Storage passthrough, not an ADF round-trip: a rename must not rewrite
      // the body it passes over.
      expect(call?.storage).toBe('<p>Hello</p>');
      expect(call?.adf).toBeUndefined();
    });

    it('reads the page as storage, the only lossless representation', async () => {
      await ops.updatePage({ pageId: '123', title: 'Renamed' });

      expect(connector.getPage).toHaveBeenCalledWith('123', 'storage');
    });

    it('substitutes an empty document when the page had no readable body', async () => {
      const updatePage = vi
        .fn()
        .mockResolvedValue({ id: '1', title: 'T', version: 3 });
      ops = new PageOperations(
        makeConnector({
          getPage: vi.fn().mockResolvedValue({
            page: { id: '1', title: 'T', status: 'current', version: 2 },
            adf: null,
            storage: null,
          }),
          updatePage,
        }),
      );

      await ops.updatePage({ pageId: '1', title: 'Renamed' });

      expect(updatePage.mock.calls[0]?.[0].adf.type).toBe('doc');
    });
  });

  describe('space format setting', () => {
    /** Operations for a space declared as Confluence XHTML. */
    function storageSpace(
      overrides: Partial<Record<keyof ConfluenceConnector, unknown>> = {},
    ): PageOperations {
      return new PageOperations(makeConnector(overrides), 'storage');
    }

    it('reads as storage without being asked', async () => {
      const ops2 = storageSpace();

      const detail = await ops2.getPageDetail('123');

      expect(detail.bodyFormat).toBe('storage');
      expect(detail.body).toBe('<p>Hello</p>');
    });

    it('still honours an explicit markdown read', async () => {
      const ops2 = storageSpace();

      const detail = await ops2.getPageDetail('123', 'markdown');

      expect(detail.bodyFormat).toBe('markdown');
      expect(detail.body).toContain('Hello');
    });

    it('refuses a markdown update even on a page with no macros', async () => {
      const ops2 = storageSpace();

      await expect(
        ops2.updatePage({ pageId: '123', markdown: '# nope' }),
      ).rejects.toThrow(/format=storage/);
    });

    it('accepts a storage update', async () => {
      const updatePage = vi
        .fn()
        .mockResolvedValue({ id: '123', title: 'T', version: 5 });
      const ops2 = storageSpace({ updatePage });

      await ops2.updatePage({ pageId: '123', storage: '<p>edited</p>' });

      expect(updatePage.mock.calls[0]?.[0].storage).toBe('<p>edited</p>');
    });

    it('refuses creating a markdown page in a storage space', async () => {
      const ops2 = storageSpace();

      await expect(
        ops2.createPage({ spaceKey: 'DOCS', title: 'New', markdown: '# hi' }),
      ).rejects.toThrow(/format=storage/);
    });

    it('creates a storage page in a storage space', async () => {
      const createPage = vi
        .fn()
        .mockResolvedValue({ id: '900', title: 'New', version: 1 });
      const ops2 = storageSpace({ createPage });

      await ops2.createPage({
        spaceKey: 'DOCS',
        title: 'New',
        storage: '<p>x</p>',
      });

      expect(createPage.mock.calls[0]?.[0].storage).toBe('<p>x</p>');
    });

    it('lets an explicit override create markdown in a storage space', async () => {
      const createPage = vi
        .fn()
        .mockResolvedValue({ id: '900', title: 'New', version: 1 });
      const ops2 = storageSpace({ createPage });

      await ops2.createPage({
        spaceKey: 'DOCS',
        title: 'New',
        markdown: '# hi',
        allowMarkupLoss: true,
      });

      expect(createPage.mock.calls[0]?.[0].adf.type).toBe('doc');
    });

    it('refuses a page with no body at all', async () => {
      await expect(
        ops.createPage({ spaceKey: 'DOCS', title: 'New' }),
      ).rejects.toThrow(/needs a body/);
    });

    it('accepts storage in a markdown space, since storage never loses anything', async () => {
      const createPage = vi
        .fn()
        .mockResolvedValue({ id: '900', title: 'New', version: 1 });
      ops = new PageOperations(makeConnector({ createPage }), 'markdown');

      await ops.createPage({
        spaceKey: 'DOCS',
        title: 'New',
        storage: '<p>x</p>',
      });

      expect(createPage.mock.calls[0]?.[0].storage).toBe('<p>x</p>');
    });
  });

  describe('storage markup guard', () => {
    /** A page body shaped like the real DevOps space: macros and page links. */
    const STORAGE_WITH_MACROS =
      '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Careful</p></ac:rich-text-body></ac:structured-macro>' +
      '<p><ac:link><ri:page ri:content-title="Other"/></ac:link></p>';

    function connectorWithMacros(): ConfluenceConnector {
      return makeConnector({
        getPage: vi.fn().mockResolvedValue({
          page: { id: '9', title: 'Runbook', status: 'current', version: 7 },
          adf: ADF_HELLO,
          storage: STORAGE_WITH_MACROS,
        }),
      });
    }

    it('refuses a markdown body that would delete macros and page links', async () => {
      ops = new PageOperations(connectorWithMacros());

      await expect(
        ops.updatePage({ pageId: '9', markdown: '# replacement' }),
      ).rejects.toThrow(MarkupLossError);
    });

    it('names what is at stake instead of failing opaquely', async () => {
      ops = new PageOperations(connectorWithMacros());

      await expect(
        ops.updatePage({ pageId: '9', markdown: 'x' }),
      ).rejects.toThrow(/macros|attachment|storage/i);
    });

    it('accepts a storage body on the same page', async () => {
      const updatePage = vi
        .fn()
        .mockResolvedValue({ id: '9', title: 'Runbook', version: 8 });
      const connectorDouble = connectorWithMacros();
      ops = new PageOperations(
        makeConnector({
          getPage: connectorDouble.getPage,
          updatePage,
        }),
      );

      await ops.updatePage({ pageId: '9', storage: '<p>edited</p>' });

      expect(updatePage.mock.calls[0]?.[0].storage).toBe('<p>edited</p>');
    });

    it('lets an explicit override through', async () => {
      const updatePage = vi
        .fn()
        .mockResolvedValue({ id: '9', title: 'Runbook', version: 8 });
      const connectorDouble = connectorWithMacros();
      ops = new PageOperations(
        makeConnector({ getPage: connectorDouble.getPage, updatePage }),
      );

      await ops.updatePage({
        pageId: '9',
        markdown: '# replacement',
        allowMarkupLoss: true,
      });

      expect(updatePage.mock.calls[0]?.[0].adf.type).toBe('doc');
    });

    it('allows markdown on a page with no storage-only markup', async () => {
      await ops.updatePage({ pageId: '123', markdown: '# fine' });

      const call = vi.mocked(connector.updatePage).mock.calls[0]?.[0];
      expect(call?.adf?.type).toBe('doc');
    });
  });

  describe('movePage', () => {
    it('carries the current title and body through unconverted', async () => {
      await ops.movePage({ pageId: '123', parentId: '456' });

      const call = vi.mocked(connector.movePage).mock.calls[0]?.[0];
      expect(call?.title).toBe('Existing title');
      expect(call?.storage).toBe('<p>Hello</p>');
      expect(call?.adf).toBeUndefined();
      expect(call?.parentId).toBe('456');
    });

    it('routes a cross-space move through the v1 content-tree endpoint', async () => {
      const movePageToTarget = vi.fn().mockResolvedValue({ pageId: '123' });
      ops = new PageOperations(makeConnector({ movePageToTarget }));

      const result = await ops.movePage({
        pageId: '123',
        parentId: '999',
        crossSpace: true,
      });

      expect(movePageToTarget).toHaveBeenCalledWith('123', 'append', '999');
      expect(result.title).toBe('Existing title');
    });

    it('routes a sibling position through v1, which v2 cannot express', async () => {
      const movePageToTarget = vi.fn().mockResolvedValue({ pageId: '123' });
      const movePage = vi.fn();
      ops = new PageOperations(makeConnector({ movePageToTarget, movePage }));

      await ops.movePage({ pageId: '123', parentId: '999', position: 'before' });

      expect(movePageToTarget).toHaveBeenCalledWith('123', 'before', '999');
      expect(movePage).not.toHaveBeenCalled();
    });
  });

  describe('inline comments', () => {
    it('counts occurrences in the page when the caller gives no match count', async () => {
      const addInlineComment = vi
        .fn()
        .mockResolvedValue({ id: 'ic1', version: 1, body: '' });
      ops = new PageOperations(makeConnector({ addInlineComment }));

      await ops.addInlineComment({
        pageId: '123',
        markdown: 'looks wrong',
        textSelection: 'Hello',
      });

      expect(addInlineComment).toHaveBeenCalledWith(
        expect.objectContaining({ matchCount: 1, textSelection: 'Hello' }),
      );
    });

    it('refuses to anchor to text that is not on the page', async () => {
      await expect(
        ops.addInlineComment({
          pageId: '123',
          markdown: 'x',
          textSelection: 'nowhere to be found',
        }),
      ).rejects.toThrow(/does not appear in page/);
    });

    it('requires a text selection for a new thread', async () => {
      await expect(
        ops.addInlineComment({ pageId: '123', markdown: 'x' }),
      ).rejects.toThrow(/must name the text_selection/);
    });

    it('skips the anchor check when replying', async () => {
      const addInlineComment = vi
        .fn()
        .mockResolvedValue({ id: 'ic2', version: 1, body: '' });
      ops = new PageOperations(makeConnector({ addInlineComment }));

      await ops.addInlineComment({
        pageId: '123',
        markdown: 'agreed',
        parentCommentId: 'ic1',
      });

      expect(addInlineComment).toHaveBeenCalledWith(
        expect.objectContaining({ parentCommentId: 'ic1' }),
      );
    });

    it('renders inline comment bodies as markdown', async () => {
      ops = new PageOperations(
        makeConnector({
          getInlineComments: vi.fn().mockResolvedValue([
            {
              comment: { id: 'ic1', version: 1, body: '', resolutionStatus: 'open' },
              adf: ADF_HELLO,
            },
          ]),
        }),
      );

      const comments = await ops.getInlineComments('123');

      expect(comments[0]?.body).toContain('Hello');
    });
  });

  describe('blog posts', () => {
    it('resolves the space key before creating', async () => {
      const createBlogPost = vi
        .fn()
        .mockResolvedValue({ id: '500', title: 'News', version: 1 });
      ops = new PageOperations(makeConnector({ createBlogPost }));

      await ops.createBlogPost({
        spaceKey: 'DOCS',
        title: 'News',
        markdown: '# hi',
      });

      expect(createBlogPost).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: '77', status: 'current' }),
      );
    });

    it('keeps the current body when only the title changes', async () => {
      const updateBlogPost = vi
        .fn()
        .mockResolvedValue({ id: '500', title: 'Renamed', version: 3 });
      const getBlogPost = vi.fn().mockResolvedValue({
        post: { id: '500', title: 'Old', status: 'current', version: 2 },
        adf: ADF_HELLO,
      });
      ops = new PageOperations(makeConnector({ getBlogPost, updateBlogPost }));

      await ops.updateBlogPost({ blogPostId: '500', title: 'Renamed' });

      expect(updateBlogPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Renamed', adf: ADF_HELLO, version: 2 }),
      );
    });

    it('reads the title before deleting', async () => {
      const getBlogPost = vi.fn().mockResolvedValue({
        post: { id: '500', title: 'News', status: 'current', version: 1 },
        adf: null,
      });
      const deleteBlogPost = vi.fn().mockResolvedValue(undefined);
      ops = new PageOperations(makeConnector({ getBlogPost, deleteBlogPost }));

      const result = await ops.deleteBlogPost('500');

      expect(result.title).toBe('News');
      expect(deleteBlogPost).toHaveBeenCalledWith('500');
    });
  });

  describe('whiteboards', () => {
    it('resolves the space key before creating', async () => {
      const createWhiteboard = vi
        .fn()
        .mockResolvedValue({ id: 'wb1', title: 'Retro' });
      ops = new PageOperations(makeConnector({ createWhiteboard }));

      await ops.createWhiteboard({ spaceKey: 'DOCS', title: 'Retro' });

      expect(createWhiteboard).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: '77', title: 'Retro' }),
      );
    });

    it('reads the title before deleting', async () => {
      const getWhiteboard = vi
        .fn()
        .mockResolvedValue({ id: 'wb1', title: 'Retro' });
      const deleteWhiteboard = vi.fn().mockResolvedValue(undefined);
      ops = new PageOperations(
        makeConnector({ getWhiteboard, deleteWhiteboard }),
      );

      const result = await ops.deleteWhiteboard('wb1');

      expect(result.title).toBe('Retro');
    });
  });

  describe('deletePage', () => {
    it('reads the title before deleting so the caller can report it', async () => {
      const result = await ops.deletePage('123');

      expect(result.title).toBe('Existing title');
      expect(connector.deletePage).toHaveBeenCalledWith('123');
    });
  });

  describe('comments', () => {
    it('converts comment bodies to markdown', async () => {
      ops = new PageOperations(
        makeConnector({
          getFooterComments: vi
            .fn()
            .mockResolvedValue([
              { comment: { id: 'c1', version: 1, body: '' }, adf: ADF_HELLO },
            ]),
        }),
      );

      const comments = await ops.getComments('123');

      expect(comments[0]?.body).toContain('Hello');
    });

    it('converts a markdown comment to ADF before sending', async () => {
      await ops.addComment({ pageId: '123', markdown: '**bold**' });

      const call = vi.mocked(connector.addFooterComment).mock.calls[0]?.[0];
      expect(call?.adf.type).toBe('doc');
      expect(call?.pageId).toBe('123');
    });
  });

  describe('searchInSpace', () => {
    it('scopes a query to the space so it cannot widen accidentally', async () => {
      const searchPages = vi.fn().mockResolvedValue([]);
      ops = new PageOperations(makeConnector({ searchPages }));

      await ops.searchInSpace('DOCS', 'text ~ "x"');

      expect(searchPages).toHaveBeenCalledWith(
        'space = "DOCS" AND (text ~ "x")',
        undefined,
      );
    });

    it('searches the whole space when no query is given', async () => {
      const searchPages = vi.fn().mockResolvedValue([]);
      ops = new PageOperations(makeConnector({ searchPages }));

      await ops.searchInSpace('DOCS', '');

      expect(searchPages).toHaveBeenCalledWith('space = "DOCS"', undefined);
    });
  });
});
