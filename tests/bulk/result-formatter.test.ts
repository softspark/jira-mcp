/**
 * Tests for the bulk result formatting functions.
 */

import { describe, it, expect } from 'vitest';

import {
  formatBulkResult,
  formatTaskResult,
} from '../../src/bulk/result-formatter';
import type { BulkResult, TaskResult } from '../../src/bulk/types';

function createBulkResult(overrides?: Partial<BulkResult>): BulkResult {
  return {
    results: [],
    summary: {
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      previewed: 0,
    },
    dry_run: false,
    total_time_ms: 150,
    ...overrides,
  };
}

function createTaskResult(overrides?: Partial<TaskResult>): TaskResult {
  return {
    summary: 'Test task',
    issue_key: 'PROJ-1',
    action: 'created',
    error: null,
    url: 'https://test.atlassian.net/browse/PROJ-1',
    ...overrides,
  };
}

describe('formatBulkResult', () => {
  it('includes DRY RUN header for dry runs', () => {
    const result = createBulkResult({
      dry_run: true,
      summary: { created: 0, updated: 0, failed: 0, skipped: 0, previewed: 3 },
    });
    const output = formatBulkResult(result);

    expect(output).toContain('=== DRY RUN ===');
    expect(output).not.toContain('EXECUTION RESULTS');
  });

  it('includes EXECUTION RESULTS header for real runs', () => {
    const result = createBulkResult({ dry_run: false });
    const output = formatBulkResult(result);

    expect(output).toContain('=== EXECUTION RESULTS ===');
    expect(output).not.toContain('DRY RUN');
  });

  it('shows previewed count for dry runs', () => {
    const result = createBulkResult({
      dry_run: true,
      summary: { created: 0, updated: 0, failed: 0, skipped: 0, previewed: 5 },
    });
    const output = formatBulkResult(result);

    expect(output).toContain('Previewed: 5');
    expect(output).not.toContain('Created:');
  });

  it('shows created/updated/skipped/failed counts for real runs', () => {
    const result = createBulkResult({
      dry_run: false,
      summary: { created: 3, updated: 1, failed: 2, skipped: 1, previewed: 0 },
    });
    const output = formatBulkResult(result);

    expect(output).toContain('Created:  3');
    expect(output).toContain('Updated:  1');
    expect(output).toContain('Skipped:  1');
    expect(output).toContain('Failed:   2');
  });

  it('formats individual task results', () => {
    const result = createBulkResult({
      results: [
        createTaskResult({ summary: 'Admin task', issue_key: 'E8A-300', action: 'created' }),
        createTaskResult({ summary: 'Failed task', issue_key: null, action: 'failed', error: 'API timeout' }),
      ],
    });
    const output = formatBulkResult(result);

    expect(output).toContain('[CREATED] E8A-300: Admin task');
    expect(output).toContain('[FAILED] (no key): Failed task - API timeout');
  });

  it('shows time in milliseconds', () => {
    const result = createBulkResult({ total_time_ms: 2345 });
    const output = formatBulkResult(result);

    expect(output).toContain('Time:     2345ms');
  });

  it('handles empty results array', () => {
    const result = createBulkResult({ results: [] });
    const output = formatBulkResult(result);

    expect(output).toContain('--- Summary ---');
    expect(output).toContain('Time:');
  });

  it('shows (no key) for tasks without issue key', () => {
    const result = createBulkResult({
      results: [
        createTaskResult({ issue_key: null, action: 'preview' }),
      ],
    });
    const output = formatBulkResult(result);

    expect(output).toContain('(no key)');
  });
});

describe('formatTaskResult', () => {
  it('formats a created task result', () => {
    const task = createTaskResult({
      action: 'created',
      issue_key: 'PROJ-42',
      summary: 'New feature',
    });
    expect(formatTaskResult(task)).toBe('[CREATED] PROJ-42: New feature');
  });

  it('formats a preview task result with no key', () => {
    const task = createTaskResult({
      action: 'preview',
      issue_key: null,
      summary: 'Preview task',
    });
    expect(formatTaskResult(task)).toBe('[PREVIEW] (preview): Preview task');
  });

  it('formats an updated task result', () => {
    const task = createTaskResult({
      action: 'updated',
      issue_key: 'BIEL-2',
      summary: 'Updated task',
    });
    expect(formatTaskResult(task)).toBe('[UPDATED] BIEL-2: Updated task');
  });

  it('formats a failed task result', () => {
    const task = createTaskResult({
      action: 'failed',
      issue_key: null,
      summary: 'Broken task',
    });
    expect(formatTaskResult(task)).toBe('[FAILED] (preview): Broken task');
  });
});
