// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the shared Atlassian HTTP client.
 *
 * Both connectors delegate transport here, so the retry loop, the auth header
 * and the empty-body handling are asserted once instead of twice.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AtlassianHttpClient } from '../../src/http/atlassian-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const CONFIG = {
  url: 'https://test.atlassian.net',
  username: 'user@example.com',
  api_token: 'token',
};

class TestError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(`${String(status)}: ${detail}`);
    this.status = status;
  }
}

function mockResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: vi
      .fn()
      .mockResolvedValue(
        typeof body === 'string' ? body : JSON.stringify(body),
      ),
    headers: new Headers(headers),
  } as unknown as Response;
}

describe('AtlassianHttpClient', () => {
  let client: AtlassianHttpClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new AtlassianHttpClient(
      CONFIG,
      ({ status, detail }) => new TestError(status, detail),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('request construction', () => {
    it('builds a Basic auth header from the credentials', () => {
      const expected = Buffer.from('user@example.com:token').toString('base64');

      expect(client.authorization).toBe(`Basic ${expected}`);
    });

    it('appends query parameters to the URL', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));

      await client.requestJson('GET', '/rest/thing', undefined, {
        a: '1',
        b: 'two words',
      });

      const url = mockFetch.mock.calls[0]?.[0] as string;
      expect(url).toContain('a=1');
      expect(url).toContain('b=two+words');
    });

    it('sets a JSON content type only when there is a body', async () => {
      mockFetch.mockResolvedValue(mockResponse({}));

      await client.requestJson('GET', '/rest/thing');
      await client.requestJson('POST', '/rest/thing', { x: 1 });

      const first = (mockFetch.mock.calls[0]?.[1] as RequestInit)
        .headers as Record<string, string>;
      const second = (mockFetch.mock.calls[1]?.[1] as RequestInit)
        .headers as Record<string, string>;
      expect(first['Content-Type']).toBeUndefined();
      expect(second['Content-Type']).toBe('application/json');
    });
  });

  describe('response handling', () => {
    it('parses a JSON body', async () => {
      mockFetch.mockResolvedValue(mockResponse({ hello: 'world' }));

      await expect(client.requestJson('GET', '/x')).resolves.toEqual({
        hello: 'world',
      });
    });

    it('returns undefined for 204', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 204));

      await expect(client.requestJson('DELETE', '/x')).resolves.toBeUndefined();
    });

    it('returns undefined for an empty 200 body', async () => {
      mockFetch.mockResolvedValue(mockResponse('', 200));

      await expect(client.requestJson('GET', '/x')).resolves.toBeUndefined();
    });

    it('propagates a malformed success body rather than swallowing it', async () => {
      mockFetch.mockResolvedValue(mockResponse('not json'));

      await expect(client.requestJson('GET', '/x')).rejects.toThrow(SyntaxError);
    });
  });

  describe('error mapping', () => {
    it('hands the mapper the status, detail, method and path', async () => {
      const mapper = vi.fn().mockReturnValue(new Error('mapped'));
      const mapped = new AtlassianHttpClient(CONFIG, mapper);
      mockFetch.mockResolvedValue(mockResponse('nope', 418));

      await expect(mapped.requestJson('PUT', '/teapot')).rejects.toThrow('mapped');
      expect(mapper).toHaveBeenCalledWith({
        status: 418,
        detail: 'nope',
        method: 'PUT',
        path: '/teapot',
      });
    });

    it('truncates a long body before handing it to the mapper', async () => {
      mockFetch.mockResolvedValue(mockResponse('x'.repeat(500), 500));

      await expect(client.requestJson('GET', '/x')).rejects.toThrow(/\.\.\./);
    });

    it('falls back to the status text when the body is empty', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: vi.fn().mockResolvedValue(''),
        headers: new Headers(),
      } as unknown as Response);

      await expect(client.requestJson('GET', '/x')).rejects.toThrow(
        /Server Error/,
      );
    });
  });

  describe('retry behaviour', () => {
    it('retries a 429 and returns the eventual success', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockResponse('slow down', 429))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.requestJson('GET', '/x');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries a 503', async () => {
      vi.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(mockResponse('down', 503))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.requestJson('GET', '/x');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ ok: true });
    });

    it('does not retry a 404', async () => {
      mockFetch.mockResolvedValue(mockResponse('gone', 404));

      await expect(client.requestJson('GET', '/x')).rejects.toThrow(TestError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('gives up after the retry budget and raises the last mapped error', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(mockResponse('busy', 429));

      const promise = client.requestJson('GET', '/x');
      const assertion = expect(promise).rejects.toThrow(/429/);
      await vi.runAllTimersAsync();
      await assertion;

      // One initial attempt plus three retries.
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('honours Retry-After over exponential backoff', async () => {
      vi.useFakeTimers();
      const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
      mockFetch
        .mockResolvedValueOnce(mockResponse('wait', 429, { 'Retry-After': '5' }))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.requestJson('GET', '/x');
      await vi.runAllTimersAsync();
      await promise;

      expect(sleepSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('caps an absurd Retry-After', async () => {
      vi.useFakeTimers();
      const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
      mockFetch
        .mockResolvedValueOnce(
          mockResponse('wait', 429, { 'Retry-After': '99999' }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.requestJson('GET', '/x');
      await vi.runAllTimersAsync();
      await promise;

      expect(sleepSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    });

    it('ignores a non-numeric Retry-After and backs off instead', async () => {
      vi.useFakeTimers();
      const sleepSpy = vi.spyOn(globalThis, 'setTimeout');
      mockFetch
        .mockResolvedValueOnce(
          mockResponse('wait', 429, { 'Retry-After': 'soon' }),
        )
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = client.requestJson('GET', '/x');
      await vi.runAllTimersAsync();
      await promise;

      expect(sleepSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('retries an extra status when the policy asks for it', async () => {
      vi.useFakeTimers();
      const lenient = new AtlassianHttpClient(
        CONFIG,
        ({ status, detail }) => new TestError(status, detail),
        { extraRetryable: new Set([502]) },
      );
      mockFetch
        .mockResolvedValueOnce(mockResponse('bad gateway', 502))
        .mockResolvedValueOnce(mockResponse({ ok: true }));

      const promise = lenient.requestJson('GET', '/x');
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toEqual({ ok: true });
    });
  });

  describe('send', () => {
    it('passes a prepared request through untouched', async () => {
      mockFetch.mockResolvedValue(mockResponse({ ok: true }));
      const form = new FormData();
      form.append('file', 'x');

      await client.send(
        new URL('https://test.atlassian.net/upload'),
        { method: 'PUT', body: form, headers: { 'X-Custom': '1' } },
        'PUT',
        '/upload',
      );

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(init.body).toBe(form);
      expect((init.headers as Record<string, string>)['X-Custom']).toBe('1');
    });
  });
});
