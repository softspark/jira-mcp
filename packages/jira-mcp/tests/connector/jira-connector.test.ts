// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Boundary tests for JiraConnector.
 *
 * Tests the private `request()` method indirectly through public methods,
 * verifying HTTP status handling, error mapping, auth headers, URL
 * construction, and edge cases like truncated error bodies and network
 * failures.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JiraConnector } from '../../src/connector/jira-connector';
import {
  AttachmentTooLargeError,
  IssueNotFoundError,
  JiraAuthenticationError,
  JiraConnectionError,
  JiraPermissionError,
} from '@softspark/atlassian-mcp-core';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  url: 'https://test.atlassian.net',
  username: 'user@example.com',
  api_token: 'test-token',
  language: 'en' as const,
};

/** Expected Base64 auth token for the test config. */
const EXPECTED_AUTH_TOKEN = Buffer.from(
  `${TEST_CONFIG.username}:${TEST_CONFIG.api_token}`,
).toString('base64');

/** Create a minimal successful Response-like object. */
function mockResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(
      typeof body === 'string' ? body : JSON.stringify(body),
    ),
    headers: new Headers(),
  } as unknown as Response;
}

/** Create an error Response with a text body. */
function mockErrorResponse(
  status: number,
  body: string,
  statusText = 'Error',
): Response {
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockRejectedValue(new Error('Not JSON')),
    text: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JiraConnector', () => {
  let connector: JiraConnector;

  beforeEach(() => {
    connector = new JiraConnector(TEST_CONFIG);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. HTTP 200 -- successful response returns parsed JSON
  // -----------------------------------------------------------------------

  describe('HTTP 200 -- successful JSON response', () => {
    it('returns parsed search results via searchIssues', async () => {
      // Arrange
      const apiResponse = {
        issues: [
          {
            key: 'PROJ-1',
            id: '10001',
            fields: {
              summary: 'Test issue',
              status: { name: 'To Do' },
              assignee: { emailAddress: 'dev@example.com' },
              priority: { name: 'High' },
              issuetype: { name: 'Story' },
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-02T00:00:00.000Z',
              project: { key: 'PROJ' },
            },
          },
        ],
      };
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const issues = await connector.searchIssues('project = PROJ');

      // Assert
      expect(issues).toHaveLength(1);
      expect(issues[0]).toEqual(
        expect.objectContaining({
          key: 'PROJ-1',
          summary: 'Test issue',
          status: 'To Do',
          assignee: 'dev@example.com',
          priority: 'High',
          issueType: 'Story',
        }),
      );
    });

    it('maps missing fields to defaults', async () => {
      // Arrange
      const apiResponse = {
        issues: [
          {
            key: 'PROJ-2',
            id: '10002',
            fields: {
              summary: 'Minimal issue',
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-01T00:00:00.000Z',
              // No status, assignee, priority, or issuetype
            },
          },
        ],
      };
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const issues = await connector.searchIssues('project = PROJ');

      // Assert
      expect(issues[0]).toEqual(
        expect.objectContaining({
          status: 'Unknown',
          assignee: null,
          priority: 'None',
          issueType: 'Unknown',
          epicLink: null,
        }),
      );
    });

    it('returns creator and reporter from searchIssues, by email or display name', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse({
          issues: [
            {
              key: 'PROJ-3',
              id: '10003',
              fields: {
                summary: 'Reported bug',
                creator: { accountId: 'a-1', emailAddress: 'creator@example.com' },
                // Atlassian privacy hides the email, only the name comes back
                reporter: { accountId: 'a-2', displayName: 'Rita Reporter' },
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        }),
      );

      // Act
      const issues = await connector.searchIssues('project = PROJ');

      // Assert
      expect(issues[0]).toEqual(
        expect.objectContaining({
          creator: 'creator@example.com',
          reporter: 'Rita Reporter',
        }),
      );
      const url = mockFetch.mock.calls[0]![0] as string;
      const requested = new URL(url).searchParams.get('fields')!.split(',');
      expect(requested).toEqual(expect.arrayContaining(['creator', 'reporter']));
    });

    it('maps an absent creator and an empty reporter to null in searchIssues', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse({
          issues: [
            {
              key: 'PROJ-4',
              id: '10004',
              fields: {
                summary: 'No reporter',
                reporter: null,
                created: '2024-01-01T00:00:00.000Z',
                updated: '2024-01-01T00:00:00.000Z',
              },
            },
          ],
        }),
      );

      // Act
      const issues = await connector.searchIssues('project = PROJ');

      // Assert
      expect(issues[0]).toEqual(
        expect.objectContaining({ creator: null, reporter: null }),
      );
    });

    it('returns creator and reporter from getIssue', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse({
          key: 'PROJ-5',
          id: '10005',
          fields: {
            summary: 'Detailed issue',
            creator: { accountId: 'a-1', emailAddress: 'creator@example.com' },
            reporter: { accountId: 'a-2', emailAddress: 'reporter@example.com' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      );

      // Act
      const issue = await connector.getIssue('PROJ-5');

      // Assert
      expect(issue.creator).toBe('creator@example.com');
      expect(issue.creatorAccountId).toBe('a-1');
      expect(issue.reporter).toBe('reporter@example.com');
      const url = mockFetch.mock.calls[0]![0] as string;
      const requested = new URL(url).searchParams.get('fields')!.split(',');
      expect(requested).toEqual(expect.arrayContaining(['creator', 'reporter']));
    });

    it('maps an absent creator and reporter to null in getIssue', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse({
          key: 'PROJ-6',
          id: '10006',
          fields: {
            summary: 'Bare issue',
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z',
          },
        }),
      );

      // Act
      const issue = await connector.getIssue('PROJ-6');

      // Assert
      expect(issue.creator).toBeNull();
      expect(issue.creatorAccountId).toBeNull();
      expect(issue.reporter).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 2. HTTP 204 -- returns undefined
  // -----------------------------------------------------------------------

  describe('HTTP 204 -- no content response', () => {
    it('returns undefined for doTransition', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      const result = await connector.doTransition('PROJ-1', '31');

      // Assert
      expect(result).toBeUndefined();
    });

    it('returns undefined for assignIssue', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      const result = await connector.assignIssue('PROJ-1', 'account-id-123');

      // Assert
      expect(result).toBeUndefined();
    });

    it('returns undefined for updateIssue', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      const result = await connector.updateIssue('PROJ-1', {
        summary: 'Updated',
      });

      // Assert
      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 3. HTTP 401 -- throws JiraAuthenticationError
  // -----------------------------------------------------------------------

  describe('HTTP 401 -- authentication error', () => {
    it('throws JiraAuthenticationError with detail', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(401, 'Unauthorized: invalid token'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(JiraAuthenticationError);
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(/Authentication failed/);
    });

    it('includes error body in message', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(401, 'Token expired at 2024-01-01'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(/Token expired at 2024-01-01/);
    });
  });

  // -----------------------------------------------------------------------
  // 4. HTTP 403 -- throws JiraPermissionError
  // -----------------------------------------------------------------------

  describe('HTTP 403 -- permission error', () => {
    it('throws JiraPermissionError', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(403, 'Forbidden: no access to project'),
      );

      // Act & Assert
      await expect(
        connector.getIssue('PROJ-1'),
      ).rejects.toThrow(JiraPermissionError);
      await expect(
        connector.getIssue('PROJ-1'),
      ).rejects.toThrow(/Permission denied/);
    });
  });

  // -----------------------------------------------------------------------
  // 5. HTTP 429 -- retryable, throws JiraConnectionError after exhaustion
  // -----------------------------------------------------------------------

  describe('HTTP 429 -- rate limit (retryable)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('throws JiraConnectionError with status 429 after retries exhausted', async () => {
      // Arrange -- mock returns 429 for all attempts (initial + 3 retries = 4 calls)
      mockFetch.mockResolvedValue(
        mockErrorResponse(429, 'Rate limit exceeded'),
      );

      // Act -- start the request and immediately attach a catch handler
      // to prevent Node.js "unhandled rejection" warnings during timer advancement
      let caughtError: unknown;
      const promise = connector
        .searchIssues('project = PROJ')
        .catch((err: unknown) => {
          caughtError = err;
        });

      // Advance through backoff delays: 1000ms, 2000ms, 4000ms
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await promise;

      // Assert
      expect(caughtError).toBeInstanceOf(JiraConnectionError);
      expect((caughtError as JiraConnectionError).message).toMatch(/429/);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('retries and succeeds if a later attempt returns 200', async () => {
      // Arrange -- first call 429, second call 200
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(429, 'Rate limit exceeded'))
        .mockResolvedValueOnce(mockResponse({ issues: [] }));

      // Act
      const promise = connector.searchIssues('project = PROJ');
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      // Assert
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects Retry-After header for backoff delay', async () => {
      // Arrange -- 429 with Retry-After: 2 (seconds)
      const retryResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: vi.fn().mockResolvedValue('Rate limit exceeded'),
        headers: new Headers({ 'Retry-After': '2' }),
      } as unknown as Response;
      mockFetch
        .mockResolvedValueOnce(retryResponse)
        .mockResolvedValueOnce(mockResponse({ issues: [] }));

      // Act
      const promise = connector.searchIssues('project = PROJ');
      // Retry-After is 2s = 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      // Assert
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 6. HTTP 500 -- throws JiraConnectionError (non-retryable)
  // -----------------------------------------------------------------------

  describe('HTTP 500 -- server error (non-retryable)', () => {
    it('throws JiraConnectionError with status 500 in message', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(500, 'Internal Server Error'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(JiraConnectionError);
    });

    it('includes status code in error message', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(500, 'Internal Server Error'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(/500/);
    });

    it('does not retry non-retryable 500 errors', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockErrorResponse(500, 'Internal Server Error'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(JiraConnectionError);
      // 500 is NOT in RETRYABLE_STATUSES, so only 1 fetch call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to statusText when body is empty', async () => {
      // Arrange
      const response = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers(),
      } as unknown as Response;
      mockFetch.mockResolvedValue(response);

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(/Bad Gateway/);
    });
  });

  // -----------------------------------------------------------------------
  // 6b. HTTP 503 -- retryable, similar to 429
  // -----------------------------------------------------------------------

  describe('HTTP 503 -- service unavailable (retryable)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries and succeeds on second attempt', async () => {
      // Arrange
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(503, 'Service Unavailable'))
        .mockResolvedValueOnce(mockResponse({ issues: [] }));

      // Act
      const promise = connector.searchIssues('project = PROJ');
      await vi.advanceTimersByTimeAsync(1000); // first backoff
      const result = await promise;

      // Assert
      expect(result).toEqual([]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Error truncation -- long error bodies truncated to 200 chars
  // -----------------------------------------------------------------------

  describe('error body truncation', () => {
    it('truncates error bodies longer than 200 characters', async () => {
      // Arrange
      const longBody = 'A'.repeat(300);
      mockFetch.mockResolvedValue(mockErrorResponse(500, longBody));

      // Act & Assert
      try {
        await connector.searchIssues('project = PROJ');
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        const error = err as JiraConnectionError;
        // The detail is truncated to 200 chars + '...'
        expect(error.message).toContain('A'.repeat(200));
        expect(error.message).toContain('...');
        // The full 300 chars should NOT be in the message
        expect(error.message).not.toContain('A'.repeat(201));
      }
    });

    it('does not truncate error bodies of exactly 200 characters', async () => {
      // Arrange
      const exactBody = 'B'.repeat(200);
      mockFetch.mockResolvedValue(mockErrorResponse(500, exactBody));

      // Act & Assert
      try {
        await connector.searchIssues('project = PROJ');
        expect.fail('Expected an error to be thrown');
      } catch (err: unknown) {
        const error = err as JiraConnectionError;
        expect(error.message).toContain(exactBody);
        expect(error.message).not.toContain('...');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 8. Malformed JSON -- fetch().json() throws
  // -----------------------------------------------------------------------

  describe('malformed JSON response', () => {
    it('propagates JSON parse error for non-204 success response', async () => {
      // Arrange
      const response = {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
        text: vi.fn().mockResolvedValue('not json'),
        headers: new Headers(),
      } as unknown as Response;
      mockFetch.mockResolvedValue(response);

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(SyntaxError);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Network error -- fetch itself throws
  // -----------------------------------------------------------------------

  describe('network error', () => {
    it('propagates fetch rejection (e.g., DNS failure)', async () => {
      // Arrange
      mockFetch.mockRejectedValue(
        new TypeError('fetch failed: getaddrinfo ENOTFOUND test.atlassian.net'),
      );

      // Act & Assert
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(TypeError);
      await expect(
        connector.searchIssues('project = PROJ'),
      ).rejects.toThrow(/fetch failed/);
    });

    it('propagates connection refused error', async () => {
      // Arrange
      mockFetch.mockRejectedValue(
        new TypeError('fetch failed: ECONNREFUSED'),
      );

      // Act & Assert
      await expect(
        connector.getIssue('PROJ-1'),
      ).rejects.toThrow(/ECONNREFUSED/);
    });
  });

  // -----------------------------------------------------------------------
  // 10. Auth header -- correct Basic auth format
  // -----------------------------------------------------------------------

  describe('auth header construction', () => {
    it('sends correct Basic auth header', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse({ issues: [] }));

      // Act
      await connector.searchIssues('project = PROJ');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Basic ${EXPECTED_AUTH_TOKEN}`);
    });

    it('includes Accept: application/json header', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse({ issues: [] }));

      // Act
      await connector.searchIssues('project = PROJ');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const headers = options.headers as Record<string, string>;
      expect(headers['Accept']).toBe('application/json');
    });

    it('includes Content-Type header when body is present', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      await connector.doTransition('PROJ-1', '31');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('does not include Content-Type header when body is absent', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse({ issues: [] }));

      // Act
      await connector.searchIssues('project = PROJ');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const headers = options.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 11. URL construction -- base URL + path + query params
  // -----------------------------------------------------------------------

  describe('URL construction', () => {
    it('constructs correct URL for search with query params', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse({ issues: [] }));

      // Act
      await connector.searchIssues('project = PROJ');

      // Assert
      const [urlStr] = mockFetch.mock.calls[0] as [string, RequestInit];
      const url = new URL(urlStr);
      expect(url.origin).toBe('https://test.atlassian.net');
      expect(url.pathname).toBe('/rest/api/3/search/jql');
      expect(url.searchParams.get('jql')).toBe('project = PROJ');
      expect(url.searchParams.get('maxResults')).toBe('1000');
    });

    it('constructs correct URL for getIssue', async () => {
      // Arrange
      const issueResponse = {
        key: 'PROJ-1',
        id: '10001',
        fields: {
          summary: 'Test',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      };
      mockFetch.mockResolvedValue(mockResponse(issueResponse));

      // Act
      await connector.getIssue('PROJ-1');

      // Assert
      const [urlStr] = mockFetch.mock.calls[0] as [string, RequestInit];
      const url = new URL(urlStr);
      expect(url.pathname).toBe('/rest/api/3/issue/PROJ-1');
      expect(url.searchParams.get('fields')).toContain('summary');
    });

    it('uses correct HTTP method for different operations', async () => {
      // Arrange -- POST for doTransition
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      await connector.doTransition('PROJ-1', '31');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(options.method).toBe('POST');
    });

    it('uses PUT method for assignIssue', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      await connector.assignIssue('PROJ-1', 'account-123');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(options.method).toBe('PUT');
    });

    it('passes serialized JSON body for POST requests', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      // Act
      await connector.doTransition('PROJ-1', '31');

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body).toEqual({ transition: { id: '31' } });
    });
  });

  // -----------------------------------------------------------------------
  // 12. encodeURIComponent -- issue keys properly encoded in paths
  // -----------------------------------------------------------------------

  describe('URL encoding of path segments', () => {
    it('encodes issue key in getIssue path', async () => {
      // Arrange
      const issueResponse = {
        key: 'PROJ-1',
        id: '10001',
        fields: {
          summary: 'Test',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      };
      mockFetch.mockResolvedValue(mockResponse(issueResponse));

      // Act -- use a key with characters that need encoding
      await connector.getIssue('PROJ-1');

      // Assert
      const [urlStr] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(urlStr).toContain('/rest/api/3/issue/PROJ-1');
    });

    it('encodes special characters in issue key', async () => {
      // Arrange -- some edge case key with unusual characters
      const issueResponse = {
        key: 'MY PROJECT-1',
        id: '10001',
        fields: {
          summary: 'Test',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      };
      mockFetch.mockResolvedValue(mockResponse(issueResponse));

      // Act
      await connector.getIssue('MY PROJECT-1');

      // Assert -- space should be encoded
      const [urlStr] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(urlStr).toContain(
        `/rest/api/3/issue/${encodeURIComponent('MY PROJECT-1')}`,
      );
    });

    it('encodes project key in getProjectStatuses path', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse([]));

      // Act
      await connector.getProjectStatuses('PROJ');

      // Assert
      const [urlStr] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(urlStr).toContain('/rest/api/3/project/PROJ/statuses');
    });
  });

  // -----------------------------------------------------------------------
  // Additional boundary tests
  // -----------------------------------------------------------------------

  describe('getTransitions', () => {
    it('returns mapped transitions', async () => {
      // Arrange
      const apiResponse = {
        transitions: [
          { id: '11', name: 'Start Progress', to: { name: 'In Progress' } },
          { id: '21', name: 'Done', to: { name: 'Done' } },
        ],
      };
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const transitions = await connector.getTransitions('PROJ-1');

      // Assert
      expect(transitions).toHaveLength(2);
      expect(transitions[0]).toEqual({
        id: '11',
        name: 'Start Progress',
        toStatus: 'In Progress',
      });
    });

    it('returns empty array when no transitions available', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse({ transitions: [] }));

      // Act
      const transitions = await connector.getTransitions('PROJ-1');

      // Assert
      expect(transitions).toEqual([]);
    });
  });

  describe('addComment', () => {
    it('sends ADF body and returns mapped comment', async () => {
      // Arrange
      const adfBody = {
        type: 'doc' as const,
        version: 1 as const,
        content: [
          {
            type: 'paragraph' as const,
            content: [{ type: 'text' as const, text: 'Hello' }],
          },
        ],
      };
      const apiResponse = {
        id: '10100',
        author: {
          accountId: 'author-1',
          emailAddress: 'author@example.com',
          displayName: 'Author',
        },
        body: adfBody,
        created: '2024-01-03T00:00:00.000Z',
      };
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const comment = await connector.addComment('PROJ-1', adfBody);

      // Assert
      expect(comment.id).toBe('10100');
      expect(comment.author).toBe('author@example.com');
      expect(comment.authorAccountId).toBe('author-1');
      expect(comment.body).toEqual(adfBody);
      expect(comment.visibility).toBeNull();
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({ body: adfBody });
    });

    it('sends visibility and maps it back from the response', async () => {
      // Arrange
      const adfBody = { type: 'doc' as const, version: 1 as const, content: [] };
      const visibility = { type: 'role' as const, value: 'Administrators' };
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '10101',
          body: adfBody,
          created: '2024-01-03T00:00:00.000Z',
          visibility: { type: 'role', value: 'Administrators', identifier: 'Administrators' },
        }),
      );

      // Act
      const comment = await connector.addComment('PROJ-1', adfBody, { visibility });

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({ body: adfBody, visibility });
      expect(comment.visibility).toEqual({
        type: 'role',
        value: 'Administrators',
        identifier: 'Administrators',
      });
    });

    it('marks an internal note with the sd.public.comment property', async () => {
      // Arrange
      const adfBody = { type: 'doc' as const, version: 1 as const, content: [] };
      mockFetch.mockResolvedValue(mockResponse({ id: '10102', body: adfBody }));

      // Act
      await connector.addComment('PROJ-1', adfBody, { internal: true });

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({
        body: adfBody,
        properties: [{ key: 'sd.public.comment', value: { internal: true } }],
      });
    });

    it('sends no property when internal is false', async () => {
      // Arrange
      const adfBody = { type: 'doc' as const, version: 1 as const, content: [] };
      mockFetch.mockResolvedValue(mockResponse({ id: '10103', body: adfBody }));

      // Act
      await connector.addComment('PROJ-1', adfBody, { internal: false });

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({ body: adfBody });
    });
  });

  describe('getInternalCommentIds', () => {
    it('reads comment properties page by page and keeps only internal notes', async () => {
      // Arrange
      const internal = [{ key: 'sd.public.comment', value: { internal: true } }];
      const page = (comments: unknown[], total: number) => mockResponse({ comments, total });
      mockFetch
        .mockResolvedValueOnce(
          page(
            [
              { id: 'c-1', properties: internal },
              { id: 'c-2', properties: [{ key: 'sd.public.comment', value: { internal: false } }] },
            ],
            3,
          ),
        )
        .mockResolvedValueOnce(page([{ id: 'c-3', properties: internal }], 3));

      // Act
      const ids = await connector.getInternalCommentIds('PROJ-1');

      // Assert
      expect([...ids]).toEqual(['c-1', 'c-3']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(first.pathname).toBe('/rest/api/3/issue/PROJ-1/comment');
      expect(first.searchParams.get('expand')).toBe('properties');
      expect(first.searchParams.get('startAt')).toBe('0');
      const second = new URL(mockFetch.mock.calls[1]![0] as string);
      expect(second.searchParams.get('startAt')).toBe('2');
    });

    it('returns an empty set for an issue without comments', async () => {
      mockFetch.mockResolvedValue(mockResponse({ comments: [], total: 0 }));

      const ids = await connector.getInternalCommentIds('PROJ-1');

      expect(ids.size).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProjectTypeKey', () => {
    it('returns the project type, or null when Jira omits it', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ id: '1', key: 'SD', projectTypeKey: 'service_desk' }))
        .mockResolvedValueOnce(mockResponse({ id: '2', key: 'OLD' }));

      expect(await connector.getProjectTypeKey('SD')).toBe('service_desk');
      expect(await connector.getProjectTypeKey('OLD')).toBeNull();
    });

    it('asks Jira once per project and answers later calls from memory', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '1', key: 'SD', projectTypeKey: 'service_desk' }));

      await connector.getProjectTypeKey('SD');
      const second = await connector.getProjectTypeKey('SD');

      expect(second).toBe('service_desk');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not remember a failed lookup', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse({ errorMessages: ['boom'] }, 500, 'Server Error'))
        .mockResolvedValue(mockResponse({ id: '1', key: 'SD', projectTypeKey: 'service_desk' }));

      await expect(connector.getProjectTypeKey('SD')).rejects.toThrow();
      expect(await connector.getProjectTypeKey('SD')).toBe('service_desk');
    });
  });

  describe('getIssue', () => {
    it('maps creator accountId and comment author accountIds', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          key: 'PROJ-1',
          id: '10001',
          fields: {
            summary: 'Test issue',
            description: null,
            creator: {
              accountId: 'creator-1',
              emailAddress: 'creator@example.com',
              displayName: 'Creator',
            },
            status: { name: 'To Do' },
            priority: { name: 'Medium' },
            issuetype: { name: 'Task' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-02T00:00:00.000Z',
            project: { key: 'PROJ' },
            comment: {
              comments: [
                {
                  id: 'c-1',
                  author: {
                    accountId: 'commenter-1',
                    emailAddress: 'commenter@example.com',
                    displayName: 'Commenter',
                  },
                  body: null,
                  created: '2024-01-03T00:00:00.000Z',
                },
                {
                  id: 'c-2',
                  body: null,
                  created: '2024-01-04T00:00:00.000Z',
                  visibility: {
                    type: 'group',
                    value: 'jira-developers',
                    identifier: '276f955c-63d7-42c8-9520-92d01dca0625',
                  },
                },
                {
                  id: 'c-3',
                  body: null,
                  created: '2024-01-05T00:00:00.000Z',
                  visibility: { type: 'unknown-kind', value: 'x' },
                },
              ],
            },
            timetracking: {},
          },
        }),
      );

      const issue = await connector.getIssue('PROJ-1');

      expect(issue.creator).toBe('creator@example.com');
      expect(issue.creatorAccountId).toBe('creator-1');
      expect(issue.comments[0]?.author).toBe('commenter@example.com');
      expect(issue.comments[0]?.authorAccountId).toBe('commenter-1');
      expect(issue.comments[0]?.visibility).toBeNull();
      expect(issue.comments[1]?.visibility).toEqual({
        type: 'group',
        value: 'jira-developers',
        identifier: '276f955c-63d7-42c8-9520-92d01dca0625',
      });
      expect(issue.comments[2]?.visibility).toBeNull();
    });
  });

  describe('deleteIssue', () => {
    it('sends DELETE to the issue endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      const result = await connector.deleteIssue('PROJ-1');

      expect(result).toBeUndefined();
      const [urlStr, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(urlStr).toContain('/rest/api/3/issue/PROJ-1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('deleteComment', () => {
    it('sends DELETE to the comment endpoint', async () => {
      mockFetch.mockResolvedValue(mockResponse(undefined, 204, 'No Content'));

      const result = await connector.deleteComment('PROJ-1', 'c-1');

      expect(result).toBeUndefined();
      const [urlStr, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(urlStr).toContain('/rest/api/3/issue/PROJ-1/comment/c-1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('createIssue', () => {
    it('returns key, id, and constructed URL', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse({ key: 'PROJ-99', id: '10099' }),
      );

      // Act
      const result = await connector.createIssue({
        project: { key: 'PROJ' },
        summary: 'New issue',
        issuetype: { name: 'Task' },
      });

      // Assert
      expect(result.key).toBe('PROJ-99');
      expect(result.id).toBe('10099');
      expect(result.url).toBe('https://test.atlassian.net/browse/PROJ-99');
    });
  });

  describe('findUser', () => {
    it('returns accountId when user is found', async () => {
      // Arrange
      mockFetch.mockResolvedValue(
        mockResponse([
          {
            accountId: 'abc-123',
            emailAddress: 'dev@example.com',
            displayName: 'Dev',
            active: true,
          },
        ]),
      );

      // Act
      const accountId = await connector.findUser('dev@example.com');

      // Assert
      expect(accountId).toBe('abc-123');
    });

    it('throws JiraConnectionError when user is not found', async () => {
      // Arrange
      mockFetch.mockResolvedValue(mockResponse([]));

      // Act & Assert
      await expect(
        connector.findUser('nonexistent@example.com'),
      ).rejects.toThrow(JiraConnectionError);
      await expect(
        connector.findUser('nonexistent@example.com'),
      ).rejects.toThrow(/User not found/);
    });
  });

  describe('getIssuesByIdsOrKeys', () => {
    it('POSTs to bulkfetch and maps the identity fields', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          issues: [
            {
              id: '10001',
              key: 'PROJ-1',
              fields: {
                summary: 'First',
                project: { id: '100', key: 'PROJ' },
                issuetype: { name: 'Bug' },
              },
            },
          ],
        }),
      );

      const refs = await connector.getIssuesByIdsOrKeys(['10001']);

      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://test.atlassian.net/rest/api/3/issue/bulkfetch');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body as string)).toEqual({
        issueIdsOrKeys: ['10001'],
        fields: ['summary', 'project', 'issuetype'],
      });
      expect(refs).toEqual([
        {
          id: '10001',
          key: 'PROJ-1',
          summary: 'First',
          projectId: '100',
          projectKey: 'PROJ',
          issueType: 'Bug',
        },
      ]);
    });

    it('falls back to the key prefix and defaults when fields are missing', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ issues: [{ id: '10002', key: 'PROJ-2' }] }),
      );

      const [ref] = await connector.getIssuesByIdsOrKeys(['PROJ-2']);

      expect(ref).toEqual({
        id: '10002',
        key: 'PROJ-2',
        summary: '',
        projectId: '',
        projectKey: 'PROJ',
        issueType: 'Unknown',
      });
    });

    it('chunks more than 100 ids into several calls', async () => {
      mockFetch.mockResolvedValue(mockResponse({ issues: [] }));
      const ids = Array.from({ length: 150 }, (_, i) => String(10000 + i));

      await connector.getIssuesByIdsOrKeys(ids);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const first = JSON.parse(
        (mockFetch.mock.calls[0]?.[1] as RequestInit).body as string,
      ) as { issueIdsOrKeys: string[] };
      const second = JSON.parse(
        (mockFetch.mock.calls[1]?.[1] as RequestInit).body as string,
      ) as { issueIdsOrKeys: string[] };
      expect(first.issueIdsOrKeys).toHaveLength(100);
      expect(second.issueIdsOrKeys).toHaveLength(50);
    });

    it('makes no call for an empty list', async () => {
      await expect(connector.getIssuesByIdsOrKeys([])).resolves.toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getUsersByAccountIds', () => {
    it('repeats accountId in the query and maps the users', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          values: [
            { accountId: 'acc-1', emailAddress: 'a@example.com', displayName: 'Ann', active: true },
            { accountId: 'acc-2', displayName: 'Bob', active: false },
          ],
        }),
      );

      const users = await connector.getUsersByAccountIds(['acc-1', 'acc-2']);

      const url = new URL(mockFetch.mock.calls[0]?.[0] as string);
      expect(url.pathname).toBe('/rest/api/3/user/bulk');
      expect(url.searchParams.getAll('accountId')).toEqual(['acc-1', 'acc-2']);
      expect(users).toEqual([
        { accountId: 'acc-1', emailAddress: 'a@example.com', displayName: 'Ann', active: true },
        { accountId: 'acc-2', emailAddress: null, displayName: 'Bob', active: false },
      ]);
    });

    it('chunks more than 100 ids into several calls', async () => {
      mockFetch.mockResolvedValue(mockResponse({ values: [] }));
      const ids = Array.from({ length: 101 }, (_, i) => `acc-${String(i)}`);

      await connector.getUsersByAccountIds(ids);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const second = new URL(mockFetch.mock.calls[1]?.[0] as string);
      expect(second.searchParams.getAll('accountId')).toEqual(['acc-100']);
    });
  });

  describe('getProject', () => {
    it('GETs the project by key and maps it', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ id: '100', key: 'PROJ', name: 'Project' }),
      );

      const project = await connector.getProject('PROJ');

      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        'https://test.atlassian.net/rest/api/3/project/PROJ',
      );
      expect(project).toEqual({ id: '100', key: 'PROJ', name: 'Project' });
    });

    it('falls back to the key when the name is missing', async () => {
      mockFetch.mockResolvedValue(mockResponse({ id: '100', key: 'PROJ' }));

      const project = await connector.getProject('PROJ');

      expect(project.name).toBe('PROJ');
    });
  });

  describe('getCurrentUser', () => {
    it('returns the authenticated Jira user', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          accountId: 'self-1',
          emailAddress: 'user@example.com',
          displayName: 'Authenticated User',
          active: true,
        }),
      );

      const user = await connector.getCurrentUser();

      expect(user).toEqual({
        accountId: 'self-1',
        emailAddress: 'user@example.com',
        displayName: 'Authenticated User',
        active: true,
      });
    });
  });

  describe('addWorklog', () => {
    it('returns mapped worklog entry', async () => {
      // Arrange
      const apiResponse = {
        id: '10200',
        timeSpent: '2h',
        timeSpentSeconds: 7200,
        created: '2024-01-04T00:00:00.000Z',
      };
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const worklog = await connector.addWorklog('PROJ-1', 7200);

      // Assert
      expect(worklog).toEqual({
        id: '10200',
        timeSpent: '2h',
        timeSpentSeconds: 7200,
        created: '2024-01-04T00:00:00.000Z',
        visibility: null,
      });
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({ timeSpentSeconds: 7200 });
    });

    it('sends comment and visibility and maps visibility back', async () => {
      // Arrange
      const comment = { type: 'doc' as const, version: 1 as const, content: [] };
      const visibility = { type: 'group' as const, identifier: 'group-id-1' };
      mockFetch.mockResolvedValue(
        mockResponse({
          id: '10201',
          timeSpentSeconds: 3600,
          visibility: { type: 'group', identifier: 'group-id-1', value: 'devs' },
        }),
      );

      // Act
      const worklog = await connector.addWorklog('PROJ-1', 3600, { comment, visibility });

      // Assert
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(options.body as string)).toEqual({
        timeSpentSeconds: 3600,
        comment,
        visibility,
      });
      expect(worklog.visibility).toEqual({
        type: 'group',
        value: 'devs',
        identifier: 'group-id-1',
      });
    });
  });

  describe('searchUsers', () => {
    it('returns mapped user list', async () => {
      // Arrange
      const apiResponse = [
        {
          accountId: 'u1',
          emailAddress: 'a@test.com',
          displayName: 'Alice',
          active: true,
        },
        {
          accountId: 'u2',
          displayName: 'Bob',
          active: false,
        },
      ];
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const users = await connector.searchUsers('test');

      // Assert
      expect(users).toHaveLength(2);
      expect(users[0]).toEqual({
        accountId: 'u1',
        emailAddress: 'a@test.com',
        displayName: 'Alice',
        active: true,
      });
      expect(users[1]).toEqual({
        accountId: 'u2',
        emailAddress: null,
        displayName: 'Bob',
        active: false,
      });
    });
  });

  describe('getFields', () => {
    it('returns mapped field definitions', async () => {
      // Arrange
      const apiResponse = [
        { id: 'summary', name: 'Summary', custom: false },
        {
          id: 'customfield_10014',
          name: 'Epic Link',
          custom: true,
          schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' },
        },
      ];
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const fields = await connector.getFields();

      // Assert
      expect(fields).toHaveLength(2);
      expect(fields[0]).toEqual({
        id: 'summary',
        name: 'Summary',
        custom: false,
      });
      expect(fields[1]).toEqual({
        id: 'customfield_10014',
        name: 'Epic Link',
        custom: true,
        schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' },
      });
    });
  });

  describe('getProjectStatuses', () => {
    it('returns statuses grouped by issue type', async () => {
      // Arrange
      const apiResponse = [
        {
          id: '10001',
          name: 'Story',
          statuses: [
            { name: 'To Do', id: '1' },
            { name: 'Done', id: '3' },
          ],
        },
      ];
      mockFetch.mockResolvedValue(mockResponse(apiResponse));

      // Act
      const statuses = await connector.getProjectStatuses('PROJ');

      // Assert
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toEqual({
        id: '10001',
        name: 'Story',
        statuses: [
          { name: 'To Do', id: '1' },
          { name: 'Done', id: '3' },
        ],
      });
    });
  });

  describe('addAttachment', () => {
    const upload = {
      filename: 'shot.png',
      content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mediaType: 'image/png',
    };

    const createdAttachment = {
      self: 'https://test.atlassian.net/rest/api/3/attachments/10000',
      id: '10000',
      filename: 'shot.png',
      author: {
        accountId: 'acc-1',
        emailAddress: 'dev@example.com',
        displayName: 'Dev',
      },
      created: '2026-10-25T10:00:00.000+0000',
      size: 4,
      mimeType: 'image/png',
      content: 'https://test.atlassian.net/rest/api/3/attachment/content/10000',
      thumbnail: 'https://test.atlassian.net/rest/api/3/attachment/thumbnail/10000',
    };

    it('POSTs a multipart form with the file under "file" and the XSRF opt-out', async () => {
      mockFetch.mockResolvedValue(mockResponse([createdAttachment]));

      await connector.addAttachment('PROJ-1', upload);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://test.atlassian.net/rest/api/3/issue/PROJ-1/attachments',
      );
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Atlassian-Token']).toBe('no-check');
      expect(headers['Authorization']).toBe(`Basic ${EXPECTED_AUTH_TOKEN}`);
      expect(headers['Content-Type']).toBeUndefined();

      const form = init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect([...form.keys()]).toEqual(['file']);
      const part = form.get('file') as File;
      expect(part.name).toBe('shot.png');
      expect(part.type).toBe('image/png');
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(upload.content);
    });

    it('maps the created attachment', async () => {
      mockFetch.mockResolvedValue(mockResponse([createdAttachment]));

      const result = await connector.addAttachment('PROJ-1', upload);

      expect(result).toEqual([
        {
          id: '10000',
          filename: 'shot.png',
          mimeType: 'image/png',
          size: 4,
          created: '2026-10-25T10:00:00.000+0000',
          author: 'dev@example.com',
          authorAccountId: 'acc-1',
          contentUrl:
            'https://test.atlassian.net/rest/api/3/attachment/content/10000',
        },
      ]);
    });

    it('fills defaults and builds the content URL when Jira omits them', async () => {
      mockFetch.mockResolvedValue(
        mockResponse([{ id: 10001, filename: 'notes', author: null }]),
      );

      const [attachment] = await connector.addAttachment('PROJ-1', upload);

      expect(attachment).toEqual({
        id: '10001',
        filename: 'notes',
        mimeType: 'application/octet-stream',
        size: 0,
        created: '',
        author: null,
        authorAccountId: null,
        contentUrl:
          'https://test.atlassian.net/rest/api/3/attachment/content/10001',
      });
    });

    it('encodes the issue key in the path', async () => {
      mockFetch.mockResolvedValue(mockResponse([createdAttachment]));

      await connector.addAttachment('PROJ 1/x', upload);

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('/rest/api/3/issue/PROJ%201%2Fx/attachments');
    });

    it('rejects a response that is not an attachment array', async () => {
      mockFetch.mockResolvedValue(mockResponse({ unexpected: true }));

      await expect(connector.addAttachment('PROJ-1', upload)).rejects.toThrow(
        /Unexpected attachment upload response/,
      );
    });

    it.each([
      [403, JiraPermissionError, 'JIRA_PERMISSION'],
      [404, IssueNotFoundError, 'ISSUE_NOT_FOUND'],
      [413, AttachmentTooLargeError, 'ATTACHMENT_TOO_LARGE'],
      [401, JiraAuthenticationError, 'JIRA_AUTH'],
      [500, JiraConnectionError, 'JIRA_CONNECTION'],
    ] as const)(
      'maps HTTP %i to %o with code %s',
      async (status, ErrorClass, code) => {
        mockFetch.mockResolvedValue(mockErrorResponse(status, 'nope'));

        const error = await connector
          .addAttachment('PROJ-1', upload)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ErrorClass);
        expect((error as { code: string }).code).toBe(code);
        expect(mockFetch).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('getAttachments', () => {
    it('reads fields=attachment from the issue and maps each entry', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({
          key: 'PROJ-1',
          fields: {
            attachment: [
              {
                id: '1',
                filename: 'a.pdf',
                mimeType: 'application/pdf',
                size: 2048,
                created: '2026-10-25T10:00:00.000+0000',
                author: { accountId: 'acc-2', displayName: 'Hidden Email' },
                content: 'https://test.atlassian.net/rest/api/3/attachment/content/1',
              },
            ],
          },
        }),
      );

      const attachments = await connector.getAttachments('PROJ-1');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/rest/api/3/issue/PROJ-1');
      expect(parsed.searchParams.get('fields')).toBe('attachment');
      expect(init.method).toBe('GET');
      expect(attachments).toEqual([
        {
          id: '1',
          filename: 'a.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          created: '2026-10-25T10:00:00.000+0000',
          author: 'Hidden Email',
          authorAccountId: 'acc-2',
          contentUrl: 'https://test.atlassian.net/rest/api/3/attachment/content/1',
        },
      ]);
    });

    it('returns an empty list when the issue has no attachment field', async () => {
      mockFetch.mockResolvedValue(mockResponse({ key: 'PROJ-1', fields: {} }));

      await expect(connector.getAttachments('PROJ-1')).resolves.toEqual([]);
    });

    it('rejects a malformed attachment entry', async () => {
      mockFetch.mockResolvedValue(
        mockResponse({ fields: { attachment: [{ id: '1' }] } }),
      );

      await expect(connector.getAttachments('PROJ-1')).rejects.toThrow(
        /Unexpected attachment list response/,
      );
    });

    it('maps a 404 to ISSUE_NOT_FOUND', async () => {
      mockFetch.mockResolvedValue(mockErrorResponse(404, 'Issue does not exist'));

      await expect(connector.getAttachments('PROJ-404')).rejects.toBeInstanceOf(
        IssueNotFoundError,
      );
    });
  });

  describe('instanceUrl property', () => {
    it('exposes the configured instance URL', () => {
      expect(connector.instanceUrl).toBe('https://test.atlassian.net');
    });
  });
});
