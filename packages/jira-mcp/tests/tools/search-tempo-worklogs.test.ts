// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the search_tempo_worklogs tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleSearchTempoWorklogs } from '../../src/tools/search-tempo-worklogs';
import { TempoNotConfiguredError } from '@softspark/atlassian-mcp-core';
import { createMergedConfig } from '@softspark/atlassian-mcp-core/test-fixtures';
import type { TempoWorklogEntry } from '../../src/operations/types';
import {
  createMockInstancePool,
  createMockConnector,
  createMockTempoClient,
  asPool,
} from '../fixtures/mocks';

const searchWorklogs = vi.fn();

vi.mock('../../src/operations/tempo-operations', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TempoOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.searchWorklogs = searchWorklogs;
    }),
  };
});

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

function entry(overrides: Partial<TempoWorklogEntry> = {}): TempoWorklogEntry {
  return {
    worklogId: '1',
    taskKey: 'PROJ0-1',
    summary: 'First',
    projectKey: 'PROJ0',
    user: { accountId: 'acc-a', displayName: 'Ann', email: 'a@example.com' },
    date: '2026-09-02',
    startTime: '09:00:00',
    timeSpentSeconds: 3600,
    timeSpent: '1h',
    billableSeconds: 3600,
    description: 'work',
    ...overrides,
  };
}

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

describe('handleSearchTempoWorklogs', () => {
  let pool: ReturnType<typeof createMockInstancePool>;
  const config = createMergedConfig();

  beforeEach(() => {
    searchWorklogs.mockReset();
    pool = createMockInstancePool();
    pool.getConnector.mockReturnValue(createMockConnector());
    pool.getTempoClient.mockReturnValue(createMockTempoClient());
  });

  it('returns the worklogs in wire shape with totals', async () => {
    searchWorklogs.mockResolvedValue([entry(), entry({ worklogId: '2', timeSpentSeconds: 1800, timeSpent: '30m' })]);

    const result = await handleSearchTempoWorklogs(
      { ...RANGE, project_key: 'PROJ0' },
      { pool: asPool(pool), config },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(2);
    expect(parsed['total_available']).toBe(2);
    expect(parsed['truncated']).toBe(false);
    expect(parsed['total_time_spent']).toBe('1h 30m');
    expect(parsed['total_seconds']).toBe(5400);
    expect(parsed['filters']).toEqual({
      project_key: 'PROJ0',
      task_key: null,
      user_email: null,
    });

    const worklogs = parsed['worklogs'] as Array<Record<string, unknown>>;
    expect(worklogs[0]).toEqual({
      worklog_id: '1',
      task_key: 'PROJ0-1',
      summary: 'First',
      project_key: 'PROJ0',
      user: { account_id: 'acc-a', display_name: 'Ann', email: 'a@example.com' },
      date: '2026-09-02',
      start_time: '09:00:00',
      time_spent: '1h',
      time_spent_seconds: 3600,
      billable_seconds: 3600,
      description: 'work',
    });
  });

  it('passes the filters through to the operations layer', async () => {
    searchWorklogs.mockResolvedValue([]);

    await handleSearchTempoWorklogs(
      { ...RANGE, project_key: 'PROJ0', task_key: 'PROJ0-7', user_email: 'a@example.com' },
      { pool: asPool(pool), config },
    );

    expect(searchWorklogs).toHaveBeenCalledWith({
      ...RANGE,
      projectKey: 'PROJ0',
      taskKey: 'PROJ0-7',
      userEmail: 'a@example.com',
    });
  });

  it('trims to the limit but reports the full total', async () => {
    searchWorklogs.mockResolvedValue([entry(), entry({ worklogId: '2' }), entry({ worklogId: '3' })]);

    const result = await handleSearchTempoWorklogs(
      { ...RANGE, limit: 2 },
      { pool: asPool(pool), config },
    );

    const parsed = parseResult(result);
    expect(parsed['count']).toBe(2);
    expect(parsed['total_available']).toBe(3);
    expect(parsed['truncated']).toBe(true);
    expect(parsed['total_seconds']).toBe(10800);
  });

  it('routes through the task key prefix when no project is given', async () => {
    searchWorklogs.mockResolvedValue([]);

    await handleSearchTempoWorklogs(
      { ...RANGE, task_key: 'PROJ0-7' },
      { pool: asPool(pool), config },
    );

    expect(pool.getTempoClient).toHaveBeenCalledWith('PROJ0');
    expect(pool.getConnector).toHaveBeenCalledWith('PROJ0');
  });

  it('routes through the default project when neither is given', async () => {
    searchWorklogs.mockResolvedValue([]);

    await handleSearchTempoWorklogs(RANGE, { pool: asPool(pool), config });

    expect(pool.getTempoClient).toHaveBeenCalledWith(config.default_project);
  });

  it('refuses a task outside the given project without calling anything', async () => {
    const result = await handleSearchTempoWorklogs(
      { ...RANGE, project_key: 'PROJ0', task_key: 'OTHER-1' },
      { pool: asPool(pool), config },
    );

    expect(result.isError).toBe(true);
    expect(parseResult(result)['error']).toContain('does not belong to project');
    expect(pool.getTempoClient).not.toHaveBeenCalled();
  });

  it('surfaces a missing Tempo token with its code', async () => {
    pool.getTempoClient.mockImplementation(() => {
      throw new TempoNotConfiguredError('No Tempo API token configured');
    });

    const result = await handleSearchTempoWorklogs(RANGE, { pool: asPool(pool), config });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('TEMPO_NOT_CONFIGURED');
    expect(parsed['error']).toContain('No Tempo API token');
  });

  it('returns failure when the operations layer throws', async () => {
    searchWorklogs.mockRejectedValue(new Error('Tempo down'));

    const result = await handleSearchTempoWorklogs(RANGE, { pool: asPool(pool), config });

    expect(result.isError).toBe(true);
    expect(parseResult(result)['error']).toBe('Tempo down');
  });
});
