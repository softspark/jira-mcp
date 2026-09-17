// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the get_tempo_report tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handleGetTempoReport } from '../../src/tools/get-tempo-report';
import { createMergedConfig } from '@softspark/atlassian-mcp-core/test-fixtures';
import type { TempoReport } from '../../src/operations/types';
import {
  createMockInstancePool,
  createMockConnector,
  createMockTempoClient,
  asPool,
} from '../fixtures/mocks';

const report = vi.fn();

vi.mock('../../src/operations/tempo-operations', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TempoOperations: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this.report = report;
    }),
  };
});

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function sampleReport(overrides: Partial<TempoReport> = {}): TempoReport {
  return {
    ...RANGE,
    groupBy: ['project', 'user'],
    totalSeconds: 9000,
    totalTimeSpent: '2h 30m',
    totalHours: 2.5,
    billableSeconds: 7200,
    worklogCount: 3,
    rows: [
      {
        project: 'PROJ0',
        user: 'Ann',
        userEmail: 'a@example.com',
        timeSpentSeconds: 9000,
        timeSpent: '2h 30m',
        hours: 2.5,
        billableSeconds: 7200,
        worklogCount: 3,
      },
    ],
    ...overrides,
  };
}

describe('handleGetTempoReport', () => {
  let pool: ReturnType<typeof createMockInstancePool>;
  const config = createMergedConfig();

  beforeEach(() => {
    report.mockReset();
    pool = createMockInstancePool();
    pool.getConnector.mockReturnValue(createMockConnector());
    pool.getTempoClient.mockReturnValue(createMockTempoClient());
  });

  it('groups by project and user when group_by is omitted', async () => {
    report.mockResolvedValue(sampleReport());

    const result = await handleGetTempoReport(
      { ...RANGE, project_key: 'PROJ0' },
      { pool: asPool(pool), config },
    );

    expect(report).toHaveBeenCalledWith(
      { ...RANGE, projectKey: 'PROJ0' },
      ['project', 'user'],
    );
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['group_by']).toEqual(['project', 'user']);
    expect(parsed['total_time_spent']).toBe('2h 30m');
    expect(parsed['total_hours']).toBe(2.5);
    expect(parsed['worklog_count']).toBe(3);
    expect(parsed['rows']).toEqual([
      {
        project: 'PROJ0',
        user: 'Ann',
        user_email: 'a@example.com',
        time_spent: '2h 30m',
        hours: 2.5,
        time_spent_seconds: 9000,
        billable_seconds: 7200,
        worklog_count: 3,
      },
    ]);
  });

  it('passes an explicit group_by and the other filters through', async () => {
    report.mockResolvedValue(sampleReport({ groupBy: ['user', 'task'], rows: [] }));

    await handleGetTempoReport(
      { ...RANGE, group_by: ['user', 'task'], user_email: 'a@example.com', task_key: 'PROJ0-3' },
      { pool: asPool(pool), config },
    );

    expect(report).toHaveBeenCalledWith(
      { ...RANGE, taskKey: 'PROJ0-3', userEmail: 'a@example.com' },
      ['user', 'task'],
    );
    expect(pool.getTempoClient).toHaveBeenCalledWith('PROJ0');
  });

  it('emits only the grouped dimensions on each row', async () => {
    report.mockResolvedValue(
      sampleReport({
        groupBy: ['task'],
        rows: [
          {
            task: 'PROJ0-3',
            summary: 'Third',
            timeSpentSeconds: 600,
            timeSpent: '10m',
            hours: 0.17,
            billableSeconds: 0,
            worklogCount: 1,
          },
        ],
      }),
    );

    const result = await handleGetTempoReport(
      { ...RANGE, group_by: ['task'] },
      { pool: asPool(pool), config },
    );

    const rows = parseResult(result)['rows'] as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({
      task: 'PROJ0-3',
      summary: 'Third',
      time_spent: '10m',
      hours: 0.17,
      time_spent_seconds: 600,
      billable_seconds: 0,
      worklog_count: 1,
    });
  });

  it('rejects an unknown group_by before resolving any client', async () => {
    const result = await handleGetTempoReport(
      { ...RANGE, group_by: ['sprint'] },
      { pool: asPool(pool), config },
    );

    expect(result.isError).toBe(true);
    expect(parseResult(result)['error']).toContain("Unknown group_by value 'sprint'");
    expect(pool.getTempoClient).not.toHaveBeenCalled();
  });

  it('returns failure when the operations layer throws', async () => {
    report.mockRejectedValue(new Error('Tempo down'));

    const result = await handleGetTempoReport(RANGE, { pool: asPool(pool), config });

    expect(result.isError).toBe(true);
    expect(parseResult(result)['error']).toBe('Tempo down');
  });
});
