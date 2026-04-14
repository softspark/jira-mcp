/**
 * Tests for BulkTaskCreator.
 *
 * Uses a fully-mocked JiraConnector to verify orchestration logic
 * without hitting any real Jira instance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BulkTaskCreator, EpicNotFoundError, EpicLinkFieldNotFoundError } from '../../src/bulk/bulk-task-creator';
import { createMockConnector, asConnector } from '../fixtures/mocks';
import type { BulkConfig } from '../../src/bulk/types';
import type { JiraField, JiraIssue } from '../../src/connector/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const EPIC_LINK_FIELD: JiraField = {
  id: 'customfield_10014',
  name: 'Epic Link',
  custom: true,
};

function buildConfig(
  overrides: Partial<BulkConfig> = {},
  taskOverrides: Partial<BulkConfig['tasks'][number]>[] = [],
): BulkConfig {
  const defaultTasks = taskOverrides.length > 0
    ? taskOverrides.map((t) => ({
        summary: 'Default task',
        type: 'Task',
        priority: 'Medium',
        labels: [],
        description: '',
        ...t,
      }))
    : [{
        summary: 'Test task',
        type: 'Task',
        priority: 'Medium',
        labels: [] as string[],
        description: '',
      }];

  return {
    epic_key: 'PROJ-100',
    tasks: defaultTasks,
    options: {
      dry_run: false,
      update_existing: false,
      match_field: 'summary',
      rate_limit_ms: 0, // zero for fast tests
      force_reassign: false,
      reassign_delay_ms: 0,
      language: 'pl',
    },
    ...overrides,
  };
}

function stubConnectorDefaults(
  connector: ReturnType<typeof createMockConnector>,
): void {
  connector.getIssue.mockResolvedValue({
    key: 'PROJ-100',
    summary: 'Epic',
    status: 'Open',
    description: null,
    assignee: null,
    priority: 'Medium',
    issueType: 'Epic',
    created: '2026-01-01',
    updated: '2026-01-01',
    projectKey: 'PROJ',
    comments: [],
    timeTracking: {
      originalEstimate: null,
      remainingEstimate: null,
      timeSpent: null,
      originalEstimateSeconds: null,
      remainingEstimateSeconds: null,
      timeSpentSeconds: null,
    },
  });
  connector.getFields.mockResolvedValue([EPIC_LINK_FIELD]);
  connector.searchIssues.mockResolvedValue([]);
  connector.createIssue.mockResolvedValue({
    key: 'PROJ-1',
    id: '10001',
    url: 'https://test.atlassian.net/browse/PROJ-1',
  });
  connector.findUser.mockResolvedValue('account-123');
  connector.getTransitions.mockResolvedValue([
    { id: '21', name: 'Start Progress', toStatus: 'In Progress' },
  ]);
  connector.doTransition.mockResolvedValue(undefined);
  connector.assignIssue.mockResolvedValue(undefined);
  connector.updateIssue.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BulkTaskCreator', () => {
  let connector: ReturnType<typeof createMockConnector>;
  let creator: BulkTaskCreator;

  beforeEach(() => {
    connector = createMockConnector();
    stubConnectorDefaults(connector);
    creator = new BulkTaskCreator(asConnector(connector), 'PROJ');
  });

  // -----------------------------------------------------------------------
  // 1. Dry run
  // -----------------------------------------------------------------------

  it('produces preview results in dry-run mode without API calls', async () => {
    const config = buildConfig({
      options: {
        dry_run: true,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      { summary: 'Task A' },
      { summary: 'Task B' },
    ]);

    const result = await creator.execute(config);

    expect(result.dry_run).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.action).toBe('preview');
    expect(result.results[1]!.action).toBe('preview');
    expect(result.summary.previewed).toBe(2);

    // No issue-mutating calls should have been made
    expect(connector.createIssue).not.toHaveBeenCalled();
    expect(connector.updateIssue).not.toHaveBeenCalled();
    expect(connector.doTransition).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 2. Create single task
  // -----------------------------------------------------------------------

  it('creates a single task with correct fields', async () => {
    const config = buildConfig({}, [
      {
        summary: 'Setup CI pipeline',
        type: 'Story',
        priority: 'High',
        estimate_hours: 4,
      },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.created).toBe(1);
    expect(connector.createIssue).toHaveBeenCalledOnce();

    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['project']).toEqual({ key: 'PROJ' });
    expect(fields['summary']).toBe('Setup CI pipeline');
    expect(fields['issuetype']).toEqual({ name: 'Story' });
    expect(fields['priority']).toEqual({ name: 'High' });
    expect(fields['timetracking']).toEqual({ originalEstimate: '4h' });
    expect(fields['customfield_10014']).toBe('PROJ-100');
  });

  // -----------------------------------------------------------------------
  // 3. ADF description
  // -----------------------------------------------------------------------

  it('converts description to ADF via markdownToAdf', async () => {
    const config = buildConfig({}, [
      { summary: 'With description', description: '**Bold** text' },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.created).toBe(1);
    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    const description = fields['description'] as Record<string, unknown>;
    expect(description).toBeDefined();
    expect(description['type']).toBe('doc');
    expect(description['version']).toBe(1);
  });

  // -----------------------------------------------------------------------
  // 4. Bilingual PL (default)
  // -----------------------------------------------------------------------

  it('uses primary summary and description when language is pl', async () => {
    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      {
        summary: 'Zadanie PL',
        summary_en: 'Task EN',
        description: 'Opis PL',
        description_en: 'Description EN',
      },
    ]);

    const result = await creator.execute(config);

    expect(result.results[0]!.summary).toBe('Zadanie PL');
    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['summary']).toBe('Zadanie PL');
  });

  // -----------------------------------------------------------------------
  // 5. Bilingual EN
  // -----------------------------------------------------------------------

  it('uses EN summary and description when language is en', async () => {
    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'en',
      },
    }, [
      {
        summary: 'Zadanie PL',
        summary_en: 'Task EN',
        description: 'Opis PL',
        description_en: 'Description EN',
      },
    ]);

    const result = await creator.execute(config);

    expect(result.results[0]!.summary).toBe('Task EN');
    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['summary']).toBe('Task EN');
  });

  // -----------------------------------------------------------------------
  // 6. Epic Link field discovery
  // -----------------------------------------------------------------------

  it('discovers Epic Link field from getFields response', async () => {
    connector.getFields.mockResolvedValue([
      { id: 'summary', name: 'Summary', custom: false },
      { id: 'customfield_10099', name: 'Epic Link', custom: true },
    ]);

    const config = buildConfig();
    await creator.execute(config);

    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['customfield_10099']).toBe('PROJ-100');
  });

  it('discovers Epic Link by schema custom type', async () => {
    connector.getFields.mockResolvedValue([
      {
        id: 'customfield_10050',
        name: 'Some Field',
        custom: true,
        schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' },
      },
    ]);

    const config = buildConfig();
    await creator.execute(config);

    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['customfield_10050']).toBe('PROJ-100');
  });

  // -----------------------------------------------------------------------
  // 7. Assignee resolution with caching
  // -----------------------------------------------------------------------

  it('resolves assignee and caches result for repeated emails', async () => {
    const config = buildConfig({}, [
      { summary: 'Task 1', assignee: 'user@example.com' },
      { summary: 'Task 2', assignee: 'user@example.com' },
    ]);

    // Return incrementing keys
    let callCount = 0;
    connector.createIssue.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        key: `PROJ-${callCount}`,
        id: String(callCount),
        url: `https://test.atlassian.net/browse/PROJ-${callCount}`,
      });
    });

    const result = await creator.execute(config);

    expect(result.summary.created).toBe(2);
    // findUser should be called only ONCE for the same email
    expect(connector.findUser).toHaveBeenCalledOnce();
    expect(connector.findUser).toHaveBeenCalledWith('user@example.com');
  });

  // -----------------------------------------------------------------------
  // 8. Update existing task
  // -----------------------------------------------------------------------

  it('updates an existing task when update_existing is true', async () => {
    // searchIssues finds an existing task
    const existingIssue: JiraIssue = {
      key: 'PROJ-50',
      summary: 'Existing task',
      status: 'To Do',
      assignee: null,
      priority: 'Medium',
      issueType: 'Task',
      created: '2026-01-01',
      updated: '2026-01-01',
      projectKey: 'PROJ',
      epicLink: null,
    };
    connector.searchIssues.mockResolvedValue([existingIssue]);

    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: true,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      { summary: 'Existing task', priority: 'High' },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.updated).toBe(1);
    expect(result.results[0]!.action).toBe('updated');
    expect(result.results[0]!.issue_key).toBe('PROJ-50');
    expect(connector.updateIssue).toHaveBeenCalledOnce();
    expect(connector.createIssue).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 9. Skip existing task
  // -----------------------------------------------------------------------

  it('skips existing task when update_existing is false', async () => {
    const existingIssue: JiraIssue = {
      key: 'PROJ-50',
      summary: 'Existing task',
      status: 'To Do',
      assignee: null,
      priority: 'Medium',
      issueType: 'Task',
      created: '2026-01-01',
      updated: '2026-01-01',
      projectKey: 'PROJ',
      epicLink: null,
    };
    connector.searchIssues.mockResolvedValue([existingIssue]);

    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      { summary: 'Existing task' },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.skipped).toBe(1);
    expect(result.results[0]!.action).toBe('skipped');
    expect(connector.createIssue).not.toHaveBeenCalled();
    expect(connector.updateIssue).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 10. Status transition
  // -----------------------------------------------------------------------

  it('transitions task to target status after creation', async () => {
    const config = buildConfig({}, [
      { summary: 'Task with status', status: 'In Progress' },
    ]);

    await creator.execute(config);

    expect(connector.getTransitions).toHaveBeenCalledWith('PROJ-1');
    expect(connector.doTransition).toHaveBeenCalledWith('PROJ-1', '21');
  });

  // -----------------------------------------------------------------------
  // 11. Force reassign
  // -----------------------------------------------------------------------

  it('reassigns issue after creation when force_reassign is true', async () => {
    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 0,
        force_reassign: true,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      { summary: 'Reassign me', assignee: 'user@example.com' },
    ]);

    await creator.execute(config);

    expect(connector.assignIssue).toHaveBeenCalledWith(
      'PROJ-1',
      'account-123',
    );
  });

  // -----------------------------------------------------------------------
  // 12. Rate limiting
  // -----------------------------------------------------------------------

  it('applies rate limiting delay between tasks', async () => {
    vi.useFakeTimers();

    const config = buildConfig({
      options: {
        dry_run: false,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 200,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      },
    }, [
      { summary: 'Task 1' },
      { summary: 'Task 2' },
    ]);

    let callCount = 0;
    connector.createIssue.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        key: `PROJ-${callCount}`,
        id: String(callCount),
        url: `https://test.atlassian.net/browse/PROJ-${callCount}`,
      });
    });

    const executePromise = creator.execute(config);

    // Advance timers to resolve the sleep(200) between tasks
    await vi.advanceTimersByTimeAsync(300);

    const result = await executePromise;

    expect(result.summary.created).toBe(2);
    expect(connector.createIssue).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 13. Failed task does not abort batch
  // -----------------------------------------------------------------------

  it('marks failing task as failed and continues processing remaining tasks', async () => {
    let callCount = 0;
    connector.createIssue.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('API rate limit exceeded'));
      }
      return Promise.resolve({
        key: 'PROJ-2',
        id: '2',
        url: 'https://test.atlassian.net/browse/PROJ-2',
      });
    });

    const config = buildConfig({}, [
      { summary: 'Failing task' },
      { summary: 'Succeeding task' },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.failed).toBe(1);
    expect(result.summary.created).toBe(1);
    expect(result.results[0]!.action).toBe('failed');
    expect(result.results[0]!.error).toBe('API rate limit exceeded');
    expect(result.results[1]!.action).toBe('created');
  });

  // -----------------------------------------------------------------------
  // 14. Invalid epic
  // -----------------------------------------------------------------------

  it('throws EpicNotFoundError when epic does not exist', async () => {
    connector.getIssue.mockRejectedValue(new Error('Not Found'));

    const config = buildConfig({ epic_key: 'PROJ-999' });

    await expect(creator.execute(config)).rejects.toThrow(EpicNotFoundError);
    await expect(creator.execute(config)).rejects.toThrow(
      "Epic 'PROJ-999' not found or not accessible",
    );
  });

  // -----------------------------------------------------------------------
  // 15. BulkResult summary counts
  // -----------------------------------------------------------------------

  it('produces correct summary counts across mixed outcomes', async () => {
    // First search returns nothing (will create), second returns existing (will skip)
    let searchCallCount = 0;
    connector.searchIssues.mockImplementation(() => {
      searchCallCount++;
      if (searchCallCount === 2) {
        return Promise.resolve([{
          key: 'PROJ-50',
          summary: 'Existing',
          status: 'To Do',
          assignee: null,
          priority: 'Medium',
          issueType: 'Task',
          created: '2026-01-01',
          updated: '2026-01-01',
          projectKey: 'PROJ',
          epicLink: null,
        }] as JiraIssue[]);
      }
      if (searchCallCount === 3) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    let createCallCount = 0;
    connector.createIssue.mockImplementation(() => {
      createCallCount++;
      if (createCallCount === 2) {
        return Promise.reject(new Error('Server Error'));
      }
      return Promise.resolve({
        key: `PROJ-${createCallCount}`,
        id: String(createCallCount),
        url: `https://test.atlassian.net/browse/PROJ-${createCallCount}`,
      });
    });

    const config = buildConfig({}, [
      { summary: 'New task' },        // created
      { summary: 'Existing' },        // skipped (update_existing=false)
      { summary: 'Will fail' },       // failed
    ]);

    const result = await creator.execute(config);

    expect(result.summary.created).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.updated).toBe(0);
    expect(result.summary.previewed).toBe(0);
    expect(result.results).toHaveLength(3);
    expect(result.total_time_ms).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('throws EpicLinkFieldNotFoundError when no Epic Link field exists', async () => {
    connector.getFields.mockResolvedValue([
      { id: 'summary', name: 'Summary', custom: false },
      { id: 'status', name: 'Status', custom: false },
    ]);

    const config = buildConfig();

    await expect(creator.execute(config)).rejects.toThrow(
      EpicLinkFieldNotFoundError,
    );
  });

  it('handles tasks without assignee gracefully', async () => {
    const config = buildConfig({}, [
      { summary: 'No assignee task' },
    ]);

    const result = await creator.execute(config);

    expect(result.summary.created).toBe(1);
    expect(connector.findUser).not.toHaveBeenCalled();
  });

  it('sets labels as plain string array in create fields', async () => {
    const config = buildConfig({}, [
      { summary: 'Labeled', labels: ['DevOps', 'monthly'] },
    ]);

    await creator.execute(config);

    const fields = connector.createIssue.mock.calls[0]![0] as Record<string, unknown>;
    expect(fields['labels']).toEqual(['DevOps', 'monthly']);
  });
});
