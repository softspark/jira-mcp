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
  JiraAuthenticationError,
  JiraConnectionError,
  JiraPermissionError,
} from '../../src/errors/index';

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
      expect(comment.body).toEqual(adfBody);
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

  describe('instanceUrl property', () => {
    it('exposes the configured instance URL', () => {
      expect(connector.instanceUrl).toBe('https://test.atlassian.net');
    });
  });
});
