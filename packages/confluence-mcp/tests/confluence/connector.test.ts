// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Boundary tests for ConfluenceConnector.
 *
 * Covers the ADF body round-trip, the version-bump contract on update, the
 * v1/v2 endpoint split, cursor pagination, and HTTP status mapping.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ConfluenceConnector } from '../../src/confluence/connector';
import {
  ConfluenceAuthenticationError,
  ConfluenceConnectionError,
  ConfluencePermissionError,
  PageNotFoundError,
  VersionConflictError,
} from '@softspark/atlassian-mcp-core';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const TEST_CONFIG = {
  url: 'https://test.atlassian.net',
  username: 'user@example.com',
  api_token: 'test-token',
  language: 'en' as const,
};

const EXPECTED_AUTH_TOKEN = Buffer.from(
  `${TEST_CONFIG.username}:${TEST_CONFIG.api_token}`,
).toString('base64');

/** Minimal ADF document used as a page body throughout. */
const ADF_DOC = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello' }],
    },
  ],
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
    text: vi
      .fn()
      .mockResolvedValue(
        typeof body === 'string' ? body : JSON.stringify(body),
      ),
    headers: new Headers(),
  } as unknown as Response;
}

function mockErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: vi.fn().mockRejectedValue(new Error('Not JSON')),
    text: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

/** The URL string passed to fetch on call number `index` (0-based). */
function fetchedUrl(index = 0): string {
  return mockFetch.mock.calls[index]?.[0] as string;
}

/** The parsed JSON body sent on call number `index` (0-based). */
function fetchedBody(index = 0): Record<string, unknown> {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('ConfluenceConnector', () => {
  let connector: ConfluenceConnector;

  beforeEach(() => {
    connector = new ConfluenceConnector(TEST_CONFIG);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Auth and URL construction
  // -----------------------------------------------------------------------

  describe('request construction', () => {
    it('sends Basic auth built from username and api_token', async () => {
      mockFetch.mockResolvedValue(mockResponse({ results: [] }));

      await connector.listSpaces();

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${EXPECTED_AUTH_TOKEN}`);
    });

    it('targets the v2 API under /wiki for page reads', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1', title: 'T' }));

      await connector.getPage('123');

      expect(fetchedUrl()).toContain('/wiki/api/v2/pages/123');
      expect(fetchedUrl()).toContain('body-format=atlas_doc_format');
    });

    it('targets the v1 API for CQL search, which v2 does not expose', async () => {
      mockFetch.mockResolvedValue(mockResponse({ results: [] }));

      await connector.searchPages('type = page');

      expect(fetchedUrl()).toContain('/wiki/rest/api/search');
      expect(fetchedUrl()).toContain('cql=type+%3D+page');
    });
  });

  // -----------------------------------------------------------------------
  // ADF round-trip
  // -----------------------------------------------------------------------

  describe('ADF body handling', () => {
    it('parses the ADF body, which arrives as a JSON string', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '123',
          title: 'Page',
          status: 'current',
          version: { number: 4 },
          body: {
            atlas_doc_format: {
              representation: 'atlas_doc_format',
              value: JSON.stringify(ADF_DOC),
            },
          },
        }),
      );

      const result = await connector.getPage('123');

      expect(result.adf).toEqual(ADF_DOC);
      expect(result.page.version).toBe(4);
    });

    it('returns null rather than throwing when the ADF body is malformed', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '123',
          body: { atlas_doc_format: { value: '{not json' } },
        }),
      );

      const result = await connector.getPage('123');

      expect(result.adf).toBeNull();
    });

    it('returns null when the page carries no ADF representation', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '123',
          body: { storage: { value: '<p>legacy</p>' } },
        }),
      );

      const result = await connector.getPage('123');

      expect(result.adf).toBeNull();
    });

    it('serialises the ADF document into a string when creating a page', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '900', title: 'New', version: { number: 1 } }),
      );

      await connector.createPage({
        spaceId: '77',
        title: 'New',
        adf: ADF_DOC,
      });

      const body = fetchedBody();
      const pageBody = body['body'] as { representation: string; value: string };
      expect(pageBody.representation).toBe('atlas_doc_format');
      expect(JSON.parse(pageBody.value)).toEqual(ADF_DOC);
      expect(body['spaceId']).toBe('77');
      expect(body['status']).toBe('current');
    });
  });

  // -----------------------------------------------------------------------
  // Version handling
  // -----------------------------------------------------------------------

  describe('updatePage version contract', () => {
    it('sends the current version plus one', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '123', title: 'T', version: { number: 8 } }),
      );

      await connector.updatePage({
        pageId: '123',
        title: 'T',
        adf: ADF_DOC,
        version: 7,
      });

      const version = fetchedBody()['version'] as { number: number };
      expect(version.number).toBe(8);
    });

    it('carries the version message when one is given', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '123', version: { number: 2 } }),
      );

      await connector.updatePage({
        pageId: '123',
        title: 'T',
        adf: ADF_DOC,
        version: 1,
        versionMessage: 'Fixed the runbook',
      });

      const version = fetchedBody()['version'] as { message: string };
      expect(version.message).toBe('Fixed the runbook');
    });

    it('maps HTTP 409 to VersionConflictError', async () => {
      mockFetch.mockResolvedValue(
        mockErrorResponse(409, 'version mismatch'),
      );

      await expect(
        connector.updatePage({
          pageId: '123',
          title: 'T',
          adf: ADF_DOC,
          version: 1,
        }),
      ).rejects.toThrow(VersionConflictError);
    });
  });

  // -----------------------------------------------------------------------
  // Space resolution
  // -----------------------------------------------------------------------

  describe('space key to id resolution', () => {
    it('resolves a key to a numeric id', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ results: [{ id: '55', key: 'DOCS', name: 'Docs' }] }),
      );

      const id = await connector.resolveSpaceId('DOCS');

      expect(id).toBe('55');
      expect(fetchedUrl()).toContain('keys=DOCS');
    });

    it('caches the id so a second lookup makes no request', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ results: [{ id: '55', key: 'DOCS' }] }),
      );

      await connector.resolveSpaceId('DOCS');
      await connector.resolveSpaceId('DOCS');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws PageNotFoundError when no space carries the key', async () => {
      mockFetch.mockResolvedValue(mockResponse({ results: [] }));

      await expect(connector.resolveSpaceId('NOPE')).rejects.toThrow(
        PageNotFoundError,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('cursor pagination', () => {
    it('follows _links.next until the limit is reached', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({
            results: [{ id: '1', title: 'One' }],
            _links: { next: '/wiki/api/v2/spaces/9/pages?cursor=abc' },
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({ results: [{ id: '2', title: 'Two' }] }),
        );

      const pages = await connector.getSpacePages('9', 10);

      expect(pages).toHaveLength(2);
      expect(fetchedUrl(1)).toContain('cursor=abc');
    });

    it('stops following links once enough items are collected', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          results: [{ id: '1' }, { id: '2' }, { id: '3' }],
          _links: { next: '/wiki/api/v2/spaces/9/pages?cursor=abc' },
        }),
      );

      const pages = await connector.getSpacePages('9', 2);

      expect(pages).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('clamps a limit above the ceiling', async () => {
      mockFetch.mockResolvedValue(mockResponse({ results: [] }));

      await connector.listSpaces(99_999);

      expect(fetchedUrl()).toContain('limit=250');
    });
  });

  // -----------------------------------------------------------------------
  // Error mapping
  // -----------------------------------------------------------------------

  describe('HTTP status mapping', () => {
    it('maps 401 to ConfluenceAuthenticationError', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(401, 'bad token'));

      await expect(connector.getPage('1')).rejects.toThrow(
        ConfluenceAuthenticationError,
      );
    });

    it('maps 403 to ConfluencePermissionError', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(403, 'no access'));

      await expect(connector.getPage('1')).rejects.toThrow(
        ConfluencePermissionError,
      );
    });

    it('maps 404 to PageNotFoundError and leaves both readings open', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404, 'missing'));

      await expect(connector.getPage('1')).rejects.toThrow(
        /not visible to this account/,
      );
    });

    it('maps an unexpected 500 to ConfluenceConnectionError', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, 'boom'));

      await expect(connector.getPage('1')).rejects.toThrow(
        ConfluenceConnectionError,
      );
    });

    it('truncates a long error body', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(500, 'x'.repeat(500)));

      await expect(connector.getPage('1')).rejects.toThrow(/\.\.\./);
    });

    it('retries a 429 and succeeds on the retry', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(429, 'slow down'))
        .mockResolvedValueOnce(mockResponse({ id: '1', title: 'T' }));

      const promise = connector.getPage('1');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.page.id).toBe('1');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('returns undefined for a 204 delete', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 204));

      await expect(connector.deletePage('1')).resolves.toBeUndefined();
    });

    it('tolerates an empty 200 body', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 200));

      await expect(connector.removeLabel('1', 'draft')).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Search mapping
  // -----------------------------------------------------------------------

  describe('search result mapping', () => {
    it('strips markup from excerpts and builds absolute URLs', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          results: [
            {
              content: {
                id: '77',
                title: 'Runbook',
                type: 'page',
                space: { key: 'DOCS' },
              },
              excerpt: 'a <b>bold</b>  match',
              url: '/spaces/DOCS/pages/77',
              lastModified: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      );

      const [hit] = await connector.searchPages('text ~ "runbook"');

      expect(hit?.excerpt).toBe('a bold match');
      expect(hit?.url).toBe(
        'https://test.atlassian.net/wiki/spaces/DOCS/pages/77',
      );
      expect(hit?.spaceKey).toBe('DOCS');
    });
  });

  // -----------------------------------------------------------------------
  // Labels
  // -----------------------------------------------------------------------

  describe('labels', () => {
    it('writes labels through the v1 endpoint', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ results: [{ id: '1', name: 'runbook' }] }),
      );

      const labels = await connector.addLabels('123', ['runbook']);

      expect(fetchedUrl()).toContain('/wiki/rest/api/content/123/label');
      expect(labels[0]?.name).toBe('runbook');
    });

    it('removes a label by name in the query string', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 204));

      await connector.removeLabel('123', 'draft');

      expect(fetchedUrl()).toContain('name=draft');
    });
  });

  // -----------------------------------------------------------------------
  // Blog posts
  // -----------------------------------------------------------------------

  describe('blog posts', () => {
    it('creates a blog post with an ADF body and no parent', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '500', title: 'News', version: { number: 1 } }),
      );

      await connector.createBlogPost({
        spaceId: '77',
        title: 'News',
        adf: ADF_DOC,
      });

      expect(fetchedUrl()).toContain('/wiki/api/v2/blogposts');
      const body = fetchedBody();
      expect(body['spaceId']).toBe('77');
      expect(body).not.toHaveProperty('parentId');
      const postBody = body['body'] as { representation: string; value: string };
      expect(JSON.parse(postBody.value)).toEqual(ADF_DOC);
    });

    it('bumps the version on update like pages do', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '500', version: { number: 3 } }),
      );

      await connector.updateBlogPost({
        blogPostId: '500',
        title: 'News',
        adf: ADF_DOC,
        version: 2,
      });

      expect((fetchedBody()['version'] as { number: number }).number).toBe(3);
    });

    it('reads a blog post body from the ADF representation', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '500',
          title: 'News',
          version: { number: 2 },
          body: { atlas_doc_format: { value: JSON.stringify(ADF_DOC) } },
        }),
      );

      const result = await connector.getBlogPost('500');

      expect(result.adf).toEqual(ADF_DOC);
      expect(result.post.version).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-space move
  // -----------------------------------------------------------------------

  describe('movePageToTarget', () => {
    it('uses the v1 content-tree endpoint with the position in the path', async () => {
      mockFetch.mockResolvedValue(mockResponse({ pageId: '123' }));

      await connector.movePageToTarget('123', 'append', '999');

      expect(fetchedUrl()).toContain('/wiki/rest/api/content/123/move/append/999');
      expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' });
    });

    it('supports sibling positions', async () => {
      mockFetch.mockResolvedValue(mockResponse({ pageId: '123' }));

      await connector.movePageToTarget('123', 'before', '999');

      expect(fetchedUrl()).toContain('/move/before/999');
    });
  });

  // -----------------------------------------------------------------------
  // Inline comments
  // -----------------------------------------------------------------------

  describe('inline comments', () => {
    it('reads the anchored text and resolution status', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          results: [
            {
              id: 'ic1',
              pageId: '123',
              version: { number: 1 },
              resolutionStatus: 'dangling',
              properties: { inlineOriginalSelection: 'the claim' },
              body: { atlas_doc_format: { value: JSON.stringify(ADF_DOC) } },
            },
          ],
        }),
      );

      const [entry] = await connector.getInlineComments('123');

      expect(fetchedUrl()).toContain('/wiki/api/v2/pages/123/inline-comments');
      expect(entry?.comment.resolutionStatus).toBe('dangling');
      expect(entry?.comment.textSelection).toBe('the claim');
    });

    it('sends anchor properties for a top-level comment', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'ic1', version: { number: 1 } }));

      await connector.addInlineComment({
        pageId: '123',
        adf: ADF_DOC,
        textSelection: 'the claim',
        matchIndex: 1,
        matchCount: 3,
      });

      const props = fetchedBody()['inlineCommentProperties'] as {
        textSelection: string;
        textSelectionMatchIndex: number;
        textSelectionMatchCount: number;
      };
      expect(props.textSelection).toBe('the claim');
      expect(props.textSelectionMatchIndex).toBe(1);
      expect(props.textSelectionMatchCount).toBe(3);
    });

    it('omits anchor properties on a reply, which the API rejects them for', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: 'ic2', version: { number: 1 } }));

      await connector.addInlineComment({
        pageId: '123',
        adf: ADF_DOC,
        parentCommentId: 'ic1',
      });

      const body = fetchedBody();
      expect(body).not.toHaveProperty('inlineCommentProperties');
      expect(body).not.toHaveProperty('pageId');
      expect(body['parentCommentId']).toBe('ic1');
    });
  });

  // -----------------------------------------------------------------------
  // Restrictions
  // -----------------------------------------------------------------------

  describe('restrictions', () => {
    it('reads users and groups per operation from the v1 endpoint', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          read: {
            operation: 'read',
            restrictions: {
              user: { results: [{ accountId: 'a1', displayName: 'Ada' }] },
              group: { results: [{ id: 'g1', name: 'devs' }] },
            },
          },
          update: { operation: 'update', restrictions: {} },
        }),
      );

      const restrictions = await connector.getRestrictions('123');

      expect(fetchedUrl()).toContain(
        '/wiki/rest/api/content/123/restriction/byOperation',
      );
      expect(restrictions.read.users).toEqual([
        { accountId: 'a1', displayName: 'Ada' },
      ]);
      expect(restrictions.read.groups).toEqual([{ id: 'g1', name: 'devs' }]);
      expect(restrictions.update.users).toEqual([]);
    });

    it('sends typed principals when setting restrictions', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}))
        .mockResolvedValueOnce(mockResponse({ read: {}, update: {} }));

      await connector.setRestrictions('123', {
        readAccountIds: ['a1'],
        readGroupIds: ['g1'],
        updateAccountIds: [],
        updateGroupIds: [],
      });

      const sent = JSON.parse(
        (mockFetch.mock.calls[0]?.[1] as RequestInit).body as string,
      ) as { operation: string; restrictions: { user: unknown[]; group: unknown[] } }[];
      expect(sent[0]?.operation).toBe('read');
      expect(sent[0]?.restrictions.user).toEqual([
        { type: 'known', accountId: 'a1' },
      ]);
      expect(sent[0]?.restrictions.group).toEqual([{ type: 'group', id: 'g1' }]);
    });

    it('reads back after writing, to surface implicit grants', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({}))
        .mockResolvedValueOnce(
          mockResponse({
            read: {
              restrictions: {
                user: {
                  results: [
                    { accountId: 'a1' },
                    { accountId: 'owner', displayName: 'Owner' },
                  ],
                },
              },
            },
          }),
        );

      const result = await connector.setRestrictions('123', {
        readAccountIds: ['a1'],
        readGroupIds: [],
        updateAccountIds: [],
        updateGroupIds: [],
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.read.users).toHaveLength(2);
    });

    it('deletes rather than writing empty lists when clearing', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 204));

      const result = await connector.setRestrictions('123', {
        readAccountIds: [],
        readGroupIds: [],
        updateAccountIds: [],
        updateGroupIds: [],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
      expect(result.read.users).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Whiteboards
  // -----------------------------------------------------------------------

  describe('whiteboards', () => {
    it('creates a whiteboard without any body field', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: 'wb1', title: 'Retro' }),
      );

      await connector.createWhiteboard({ spaceId: '77', title: 'Retro' });

      expect(fetchedUrl()).toContain('/wiki/api/v2/whiteboards');
      expect(fetchedBody()).not.toHaveProperty('body');
    });

    it('reads whiteboard metadata', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: 'wb1', title: 'Retro', spaceId: '77' }),
      );

      const board = await connector.getWhiteboard('wb1');

      expect(board.title).toBe('Retro');
      expect(board.spaceId).toBe('77');
    });
  });

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------

  describe('attachments', () => {
    it('uploads multipart with the XSRF opt-out header', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          results: [
            {
              id: 'att1',
              title: 'notes.txt',
              version: { number: 1 },
              extensions: { mediaType: 'text/plain', fileSize: 5 },
            },
          ],
        }),
      );

      const attachment = await connector.uploadAttachment({
        pageId: '123',
        filename: 'notes.txt',
        content: Uint8Array.from(Buffer.from('hello')),
        mediaType: 'text/plain',
      });

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Atlassian-Token']).toBe('no-check');
      expect(init.body).toBeInstanceOf(FormData);
      expect(attachment.title).toBe('notes.txt');
      expect(attachment.mediaType).toBe('text/plain');
    });

    it('stores only the basename, so a path cannot redirect the upload', async () => {
      mockFetch.mockResolvedValue(mockResponse({ results: [] }));

      const attachment = await connector.uploadAttachment({
        pageId: '123',
        filename: '../../etc/passwd',
        content: Uint8Array.from(Buffer.from('x')),
      });

      expect(attachment.title).toBe('passwd');
    });
  });
});
