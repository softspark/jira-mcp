// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Boundary tests for TempoClient.
 *
 * Covers the three things this client owns on top of the shared transport:
 * the bearer header and URL shape, the pagination loop, and the mapping of
 * Tempo's raw worklog onto the lean type.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

import { TempoClient } from '../../src/connector/tempo-client';
import {
  TempoAuthenticationError,
  TempoConnectionError,
  TempoPermissionError,
} from '@softspark/atlassian-mcp-core';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: vi
      .fn()
      .mockResolvedValue(
        typeof body === 'string' ? body : JSON.stringify(body),
      ),
    headers: new Headers(),
  } as unknown as Response;
}

function rawWorklog(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tempoWorklogId: 501,
    issue: { id: 10001, self: 'https://test.atlassian.net/rest/api/2/issue/10001' },
    timeSpentSeconds: 3600,
    billableSeconds: 1800,
    startDate: '2026-09-01',
    startTime: '09:00:00',
    description: 'Reviewed the deploy',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    author: { accountId: 'acc-1', self: 'https://test.atlassian.net/rest/api/2/user?accountId=acc-1' },
    ...overrides,
  };
}

function page(
  results: readonly unknown[],
  next?: string,
): Record<string, unknown> {
  return {
    metadata: {
      count: results.length,
      offset: 0,
      limit: PAGE_SIZE,
      ...(next !== undefined ? { next } : {}),
    },
    results,
  };
}

function calledUrl(index = 0): string {
  return mockFetch.mock.calls[index]?.[0] as string;
}

function calledInit(index = 0): RequestInit {
  return mockFetch.mock.calls[index]?.[1] as RequestInit;
}

const QUERY = { from: '2026-09-01', to: '2026-09-30' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TempoClient', () => {
  let client: TempoClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new TempoClient({
      apiUrl: 'https://api.tempo.io/4',
      token: 'tempo-secret',
    });
  });

  describe('request construction', () => {
    it('sends a Bearer token and asks for JSON', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([])));

      await client.getWorklogs(QUERY);

      const headers = calledInit().headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer tempo-secret');
      expect(headers['Accept']).toBe('application/json');
    });

    it('keeps the version segment when the base URL has no trailing slash', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([])));

      await client.getWorklogs(QUERY);

      expect(calledUrl()).toMatch(/^https:\/\/api\.tempo\.io\/4\/worklogs\?/);
      expect(client.apiUrl).toBe('https://api.tempo.io/4/');
    });

    it('sends the date range plus limit and offset', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([])));

      await client.getWorklogs(QUERY);

      const url = new URL(calledUrl());
      expect(url.searchParams.get('from')).toBe('2026-09-01');
      expect(url.searchParams.get('to')).toBe('2026-09-30');
      expect(url.searchParams.get('limit')).toBe(String(PAGE_SIZE));
      expect(url.searchParams.get('offset')).toBe('0');
    });

    it('repeats issueId and projectId for each id', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([])));

      await client.getWorklogs({
        ...QUERY,
        issueIds: ['10001', '10002'],
        projectIds: ['7'],
      });

      const url = new URL(calledUrl());
      expect(url.searchParams.getAll('issueId')).toEqual(['10001', '10002']);
      expect(url.searchParams.getAll('projectId')).toEqual(['7']);
    });

    it('routes an author filter to worklogs/user and drops the id filters', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([])));

      await client.getWorklogs({
        ...QUERY,
        authorAccountId: 'acc:1/2',
        issueIds: ['10001'],
        projectIds: ['7'],
      });

      const url = new URL(calledUrl());
      expect(url.pathname).toBe('/4/worklogs/user/acc%3A1%2F2');
      expect(url.searchParams.has('issueId')).toBe(false);
      expect(url.searchParams.has('projectId')).toBe(false);
      expect(url.searchParams.get('from')).toBe('2026-09-01');
    });
  });

  describe('worklog mapping', () => {
    it('maps the raw worklog onto the lean shape', async () => {
      mockFetch.mockResolvedValue(mockResponse(page([rawWorklog()])));

      const [worklog] = await client.getWorklogs(QUERY);

      expect(worklog).toEqual({
        id: '501',
        issueId: '10001',
        authorAccountId: 'acc-1',
        timeSpentSeconds: 3600,
        billableSeconds: 1800,
        startDate: '2026-09-01',
        startTime: '09:00:00',
        description: 'Reviewed the deploy',
        createdAt: '2026-09-01T10:00:00Z',
        updatedAt: '2026-09-01T10:00:00Z',
      });
    });

    it('defaults the fields Tempo may omit', async () => {
      mockFetch.mockResolvedValue(
        mockResponse(page([{ timeSpentSeconds: 60 }])),
      );

      const [worklog] = await client.getWorklogs(QUERY);

      expect(worklog).toEqual({
        id: '',
        issueId: '',
        authorAccountId: '',
        timeSpentSeconds: 60,
        billableSeconds: 0,
        startDate: '',
        startTime: null,
        description: '',
        createdAt: '',
        updatedAt: '',
      });
    });

    it('returns an empty list for a body without results', async () => {
      mockFetch.mockResolvedValue(mockResponse({ metadata: { count: 0 } }));

      await expect(client.getWorklogs(QUERY)).resolves.toEqual([]);
    });
  });

  describe('pagination', () => {
    it('follows pages until a short one and advances the offset', async () => {
      const full = Array.from({ length: PAGE_SIZE }, (_, i) =>
        rawWorklog({ tempoWorklogId: i }),
      );
      const rest = [rawWorklog({ tempoWorklogId: 9001 }), rawWorklog({ tempoWorklogId: 9002 })];
      mockFetch
        .mockResolvedValueOnce(mockResponse(page(full, 'https://api.tempo.io/4/worklogs?offset=1000')))
        .mockResolvedValueOnce(mockResponse(page(rest)));

      const worklogs = await client.getWorklogs(QUERY);

      expect(worklogs).toHaveLength(PAGE_SIZE + 2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(new URL(calledUrl(1)).searchParams.get('offset')).toBe('1000');
    });

    it('stops after a full page that carries no next link', async () => {
      const full = Array.from({ length: PAGE_SIZE }, () => rawWorklog());
      mockFetch.mockResolvedValue(mockResponse(page(full)));

      const worklogs = await client.getWorklogs(QUERY);

      expect(worklogs).toHaveLength(PAGE_SIZE);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('refuses to grow past the worklog cap', async () => {
      const full = Array.from({ length: PAGE_SIZE }, () => rawWorklog());
      mockFetch.mockImplementation(() =>
        Promise.resolve(mockResponse(page(full, 'next'))),
      );

      await expect(client.getWorklogs(QUERY)).rejects.toThrow(
        TempoConnectionError,
      );
      await expect(client.getWorklogs(QUERY)).rejects.toThrow(
        /Narrow the date range/,
      );
    });
  });

  describe('error mapping', () => {
    it('maps 401 to TempoAuthenticationError', async () => {
      mockFetch.mockResolvedValue(mockResponse('bad token', 401));

      await expect(client.getWorklogs(QUERY)).rejects.toThrow(
        TempoAuthenticationError,
      );
    });

    it('maps 403 to TempoPermissionError', async () => {
      mockFetch.mockResolvedValue(mockResponse('no access', 403));

      await expect(client.getWorklogs(QUERY)).rejects.toThrow(
        TempoPermissionError,
      );
    });

    it('maps any other failure to TempoConnectionError with the status', async () => {
      mockFetch.mockResolvedValue(mockResponse('boom', 500));

      const error = await client.getWorklogs(QUERY).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TempoConnectionError);
      expect((error as Error).message).toContain('500');
      expect((error as Error).message).toContain('boom');
    });
  });
});
