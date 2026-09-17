// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for TempoOperations: filter resolution, Jira enrichment and the
 * report aggregation. Both clients are fakes; nothing leaves the process.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { TempoOperations, assertGroupBy } from '../../src/operations/tempo-operations';
import { JiraConnectionError } from '@softspark/atlassian-mcp-core';
import type { TempoWorklog } from '../../src/connector/tempo-types';
import {
  createMockConnector,
  createMockTempoClient,
  asConnector,
  asTempoClient,
} from '../fixtures/mocks';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function worklog(overrides: Partial<TempoWorklog> = {}): TempoWorklog {
  return {
    id: '1',
    issueId: '10001',
    authorAccountId: 'acc-a',
    timeSpentSeconds: 3600,
    billableSeconds: 3600,
    startDate: '2026-09-02',
    startTime: '09:00:00',
    description: 'work',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const ISSUES = [
  { id: '10001', key: 'PROJ-1', summary: 'First', projectId: '100', projectKey: 'PROJ', issueType: 'Task' },
  { id: '10002', key: 'PROJ-2', summary: 'Second', projectId: '100', projectKey: 'PROJ', issueType: 'Task' },
  { id: '20001', key: 'OTHER-1', summary: 'Elsewhere', projectId: '200', projectKey: 'OTHER', issueType: 'Task' },
];

const USERS = [
  { accountId: 'acc-a', emailAddress: 'a@example.com', displayName: 'Ann', active: true },
  { accountId: 'acc-b', emailAddress: null, displayName: 'Bob', active: true },
];

function setup() {
  const jira = createMockConnector();
  const tempo = createMockTempoClient();
  jira.getIssuesByIdsOrKeys.mockImplementation((ids: readonly string[]) =>
    Promise.resolve(ISSUES.filter((i) => ids.includes(i.id) || ids.includes(i.key))),
  );
  jira.getUsersByAccountIds.mockImplementation((ids: readonly string[]) =>
    Promise.resolve(USERS.filter((u) => ids.includes(u.accountId))),
  );
  jira.getProject.mockResolvedValue({ id: '100', key: 'PROJ', name: 'Project' });
  jira.findUser.mockResolvedValue('acc-a');
  tempo.getWorklogs.mockResolvedValue([]);
  const ops = new TempoOperations(asTempoClient(tempo), asConnector(jira));
  return { jira, tempo, ops };
}

// ---------------------------------------------------------------------------
// searchWorklogs
// ---------------------------------------------------------------------------

describe('TempoOperations.searchWorklogs', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  describe('date validation', () => {
    it('rejects a date that is not YYYY-MM-DD before calling anything', async () => {
      await expect(
        ctx.ops.searchWorklogs({ from: '01/09/2026', to: '2026-09-30' }),
      ).rejects.toThrow("Invalid 'from' date");
      expect(ctx.tempo.getWorklogs).not.toHaveBeenCalled();
    });

    it('rejects a well-formed but impossible date', async () => {
      await expect(
        ctx.ops.searchWorklogs({ from: '2026-09-01', to: '2026-13-45' }),
      ).rejects.toThrow("Invalid 'to' date");
    });

    it('rejects from after to', async () => {
      await expect(
        ctx.ops.searchWorklogs({ from: '2026-09-30', to: '2026-09-01' }),
      ).rejects.toThrow('Invalid date range');
    });
  });

  describe('filter resolution', () => {
    it('queries by date alone when no filter is given', async () => {
      await ctx.ops.searchWorklogs(RANGE);

      expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith(RANGE);
      expect(ctx.jira.getProject).not.toHaveBeenCalled();
      expect(ctx.jira.findUser).not.toHaveBeenCalled();
    });

    it('resolves a project key to its numeric id', async () => {
      await ctx.ops.searchWorklogs({ ...RANGE, projectKey: 'PROJ' });

      expect(ctx.jira.getProject).toHaveBeenCalledWith('PROJ');
      expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith({
        ...RANGE,
        projectIds: ['100'],
      });
    });

    it('resolves a task key to its issue id and skips the project lookup', async () => {
      await ctx.ops.searchWorklogs({ ...RANGE, projectKey: 'PROJ', taskKey: 'PROJ-2' });

      expect(ctx.jira.getIssuesByIdsOrKeys).toHaveBeenCalledWith(['PROJ-2']);
      expect(ctx.jira.getProject).not.toHaveBeenCalled();
      expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith({
        ...RANGE,
        issueIds: ['10002'],
      });
    });

    it('rejects a task outside the given project', async () => {
      await expect(
        ctx.ops.searchWorklogs({ ...RANGE, projectKey: 'PROJ', taskKey: 'OTHER-1' }),
      ).rejects.toThrow("does not belong to project 'PROJ'");
      expect(ctx.tempo.getWorklogs).not.toHaveBeenCalled();
    });

    it('throws JiraConnectionError when the task key does not resolve', async () => {
      await expect(
        ctx.ops.searchWorklogs({ ...RANGE, taskKey: 'PROJ-999' }),
      ).rejects.toThrow(JiraConnectionError);
    });

    it('resolves a user email to an account id', async () => {
      await ctx.ops.searchWorklogs({ ...RANGE, userEmail: 'a@example.com' });

      expect(ctx.jira.findUser).toHaveBeenCalledWith('a@example.com');
      expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith({
        ...RANGE,
        authorAccountId: 'acc-a',
      });
    });
  });

  describe('enrichment', () => {
    it('attaches issue keys, summaries and user names', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([
        worklog({ id: '1', issueId: '10001', authorAccountId: 'acc-a' }),
        worklog({ id: '2', issueId: '10002', authorAccountId: 'acc-b', timeSpentSeconds: 5400, billableSeconds: 0 }),
      ]);

      const entries = await ctx.ops.searchWorklogs(RANGE);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        worklogId: '1',
        taskKey: 'PROJ-1',
        summary: 'First',
        projectKey: 'PROJ',
        user: { accountId: 'acc-a', displayName: 'Ann', email: 'a@example.com' },
        date: '2026-09-02',
        timeSpent: '1h',
      });
      expect(entries[1]).toMatchObject({
        taskKey: 'PROJ-2',
        user: { accountId: 'acc-b', displayName: 'Bob', email: null },
        timeSpentSeconds: 5400,
        timeSpent: '1h 30m',
        billableSeconds: 0,
      });
    });

    it('looks each issue and user up once, however many worklogs share them', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([
        worklog({ id: '1' }),
        worklog({ id: '2' }),
        worklog({ id: '3', issueId: '10002' }),
      ]);

      await ctx.ops.searchWorklogs(RANGE);

      expect(ctx.jira.getIssuesByIdsOrKeys).toHaveBeenCalledTimes(1);
      expect(ctx.jira.getIssuesByIdsOrKeys).toHaveBeenCalledWith(['10001', '10002']);
      expect(ctx.jira.getUsersByAccountIds).toHaveBeenCalledWith(['acc-a']);
    });

    it('skips the Jira lookups when Tempo returns nothing', async () => {
      await ctx.ops.searchWorklogs(RANGE);

      expect(ctx.jira.getIssuesByIdsOrKeys).not.toHaveBeenCalled();
      expect(ctx.jira.getUsersByAccountIds).not.toHaveBeenCalled();
    });

    it('keeps the hours of an issue Jira will not return', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([worklog({ issueId: '99999' })]);

      const [entry] = await ctx.ops.searchWorklogs(RANGE);

      expect(entry).toMatchObject({
        taskKey: '#99999',
        summary: '(issue not visible)',
        projectKey: '',
        timeSpentSeconds: 3600,
      });
    });

    it('falls back to the account id for an unknown user', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([worklog({ authorAccountId: 'acc-gone' })]);

      const [entry] = await ctx.ops.searchWorklogs(RANGE);

      expect(entry?.user).toEqual({
        accountId: 'acc-gone',
        displayName: 'acc-gone',
        email: null,
      });
    });
  });

  describe('client-side filtering', () => {
    it('drops other projects from a per-user query', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([
        worklog({ id: '1', issueId: '10001' }),
        worklog({ id: '2', issueId: '20001' }),
      ]);

      const entries = await ctx.ops.searchWorklogs({
        ...RANGE,
        projectKey: 'PROJ',
        userEmail: 'a@example.com',
      });

      expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith({
        ...RANGE,
        projectIds: ['100'],
        authorAccountId: 'acc-a',
      });
      expect(entries.map((e) => e.taskKey)).toEqual(['PROJ-1']);
    });

    it('drops other tasks from a per-user query', async () => {
      ctx.tempo.getWorklogs.mockResolvedValue([
        worklog({ id: '1', issueId: '10001' }),
        worklog({ id: '2', issueId: '10002' }),
      ]);

      const entries = await ctx.ops.searchWorklogs({
        ...RANGE,
        taskKey: 'PROJ-2',
        userEmail: 'a@example.com',
      });

      expect(entries.map((e) => e.taskKey)).toEqual(['PROJ-2']);
    });
  });
});

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

describe('TempoOperations.report', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
    ctx.tempo.getWorklogs.mockResolvedValue([
      worklog({ id: '1', issueId: '10001', authorAccountId: 'acc-a', timeSpentSeconds: 3600, billableSeconds: 3600 }),
      worklog({ id: '2', issueId: '10002', authorAccountId: 'acc-a', timeSpentSeconds: 1800, billableSeconds: 0 }),
      worklog({ id: '3', issueId: '10002', authorAccountId: 'acc-b', timeSpentSeconds: 7200, billableSeconds: 7200 }),
      worklog({ id: '4', issueId: '20001', authorAccountId: 'acc-b', timeSpentSeconds: 900, billableSeconds: 900 }),
    ]);
  });

  it('sums by project then user, largest first', async () => {
    const report = await ctx.ops.report(RANGE, ['project', 'user']);

    expect(report.rows).toEqual([
      { project: 'PROJ', user: 'Bob', userEmail: null, timeSpentSeconds: 7200, timeSpent: '2h', hours: 2, billableSeconds: 7200, worklogCount: 1 },
      { project: 'PROJ', user: 'Ann', userEmail: 'a@example.com', timeSpentSeconds: 5400, timeSpent: '1h 30m', hours: 1.5, billableSeconds: 3600, worklogCount: 2 },
      { project: 'OTHER', user: 'Bob', userEmail: null, timeSpentSeconds: 900, timeSpent: '15m', hours: 0.25, billableSeconds: 900, worklogCount: 1 },
    ]);
  });

  it('carries totals over every matching worklog', async () => {
    const report = await ctx.ops.report(RANGE, ['user']);

    expect(report).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: ['user'],
      totalSeconds: 13500,
      totalTimeSpent: '3h 45m',
      totalHours: 3.75,
      billableSeconds: 11700,
      worklogCount: 4,
    });
    expect(report.rows.map((r) => r.user)).toEqual(['Bob', 'Ann']);
  });

  it('groups by task with the summary attached', async () => {
    const report = await ctx.ops.report(RANGE, ['task']);

    expect(report.rows[0]).toEqual({
      task: 'PROJ-2',
      summary: 'Second',
      timeSpentSeconds: 9000,
      timeSpent: '2h 30m',
      hours: 2.5,
      billableSeconds: 7200,
      worklogCount: 2,
    });
    expect(report.rows[0]).not.toHaveProperty('project');
    expect(report.rows[0]).not.toHaveProperty('user');
  });

  it('breaks ties by key so two runs order the same', async () => {
    ctx.tempo.getWorklogs.mockResolvedValue([
      worklog({ id: '1', issueId: '10002', timeSpentSeconds: 600 }),
      worklog({ id: '2', issueId: '10001', timeSpentSeconds: 600 }),
    ]);

    const report = await ctx.ops.report(RANGE, ['task']);

    expect(report.rows.map((r) => r.task)).toEqual(['PROJ-1', 'PROJ-2']);
  });

  it('applies the same filters as searchWorklogs', async () => {
    await ctx.ops.report({ ...RANGE, projectKey: 'PROJ' }, ['user']);

    expect(ctx.tempo.getWorklogs).toHaveBeenCalledWith({
      ...RANGE,
      projectIds: ['100'],
    });
  });

  it('rejects a bad group_by before touching the network', async () => {
    await expect(ctx.ops.report(RANGE, [] as never)).rejects.toThrow(
      'at least one of',
    );
    expect(ctx.tempo.getWorklogs).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// assertGroupBy
// ---------------------------------------------------------------------------

describe('assertGroupBy', () => {
  it('accepts any order of the known dimensions', () => {
    expect(() => assertGroupBy(['task', 'user', 'project'])).not.toThrow();
  });

  it('rejects an unknown dimension', () => {
    expect(() => assertGroupBy(['project', 'sprint'])).toThrow(
      "Unknown group_by value 'sprint'",
    );
  });

  it('rejects a repeated dimension', () => {
    expect(() => assertGroupBy(['user', 'user'])).toThrow("lists 'user' twice");
  });
});
