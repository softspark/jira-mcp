/**
 * Formatters for bulk operation results.
 *
 * Produces human-readable, CLI-friendly text output suitable for
 * MCP tool responses.
 */

import type { BulkResult, TaskResult } from './types.js';

/**
 * Format a complete bulk result into multi-line CLI output.
 *
 * @param result - The bulk operation result to format.
 * @returns Human-readable text representation.
 */
export function formatBulkResult(result: BulkResult): string {
  const lines: string[] = [];

  // Header
  lines.push(result.dry_run ? '=== DRY RUN ===' : '=== EXECUTION RESULTS ===');
  lines.push('');

  // Individual task results
  for (const task of result.results) {
    const status = task.action.toUpperCase();
    const key = task.issue_key ?? '(no key)';
    const errMsg = task.error ? ` - ${task.error}` : '';
    lines.push(`  [${status}] ${key}: ${task.summary}${errMsg}`);
  }

  // Summary section
  lines.push('');
  lines.push('--- Summary ---');
  const { summary } = result;
  if (result.dry_run) {
    lines.push(`  Previewed: ${summary.previewed}`);
  } else {
    lines.push(`  Created:  ${summary.created}`);
    lines.push(`  Updated:  ${summary.updated}`);
    lines.push(`  Skipped:  ${summary.skipped}`);
    lines.push(`  Failed:   ${summary.failed}`);
  }
  lines.push(`  Time:     ${result.total_time_ms}ms`);

  return lines.join('\n');
}

/**
 * Format a single task result for inline display.
 *
 * @param result - Individual task result.
 * @returns Single-line formatted string.
 */
export function formatTaskResult(result: TaskResult): string {
  const key = result.issue_key ?? '(preview)';
  return `[${result.action.toUpperCase()}] ${key}: ${result.summary}`;
}
