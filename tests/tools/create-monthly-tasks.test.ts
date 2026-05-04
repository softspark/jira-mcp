/**
 * Tests for the create_monthly_tasks tool handler.
 *
 * Uses a temp templates directory and mocked Jira dependencies, mirroring
 * the testing pattern of the underlying CLI handler.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleCreateMonthlyTasks } from '../../src/tools/create-monthly-tasks';
import type { CreateMonthlyDeps } from '../../src/cli/commands/create-monthly';
import type { BulkResult } from '../../src/bulk/types';
import type { JiraConfig } from '../../src/config/types';

let tempDir: string;
let templatesDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-tool-monthly-'));
  templatesDir = join(tempDir, 'templates', 'tasks');
  await mkdir(templatesDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function buildJiraConfig(): JiraConfig {
  return {
    projects: {
      BIEL: {
        url: 'https://biel.atlassian.net',
        username: 'u@example.com',
        api_token: 'tok',
      },
      E8A: {
        url: 'https://e8a.atlassian.net',
        username: 'u@example.com',
        api_token: 'tok',
      },
    },
    default_project: 'BIEL',
    credentials: { username: 'u@example.com', api_token: 'tok' },
  };
}

function buildBulkResult(dryRun: boolean): BulkResult {
  return {
    results: [
      {
        summary: 'Prace administracyjne DevOps 04.2026',
        issue_key: dryRun ? null : 'BIEL-100',
        action: dryRun ? 'preview' : 'created',
        error: null,
        url: null,
      },
    ],
    summary: {
      created: dryRun ? 0 : 1,
      updated: 0,
      failed: 0,
      skipped: 0,
      previewed: dryRun ? 1 : 0,
    },
    dry_run: dryRun,
    total_time_ms: 42,
  };
}

async function writeConfig(projectDir: string, epicKey: string): Promise<void> {
  const dir = join(templatesDir, projectDir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'monthly_admin.json'),
    JSON.stringify({
      epic_key: epicKey,
      tasks: [
        {
          summary: 'Prace administracyjne DevOps {MONTH}',
          type: 'Task',
          priority: 'Medium',
        },
      ],
      options: { dry_run: true },
    }),
  );
}

function buildDeps(dryRun: boolean): CreateMonthlyDeps {
  const mockExecute = vi.fn().mockResolvedValue(buildBulkResult(dryRun));

  return {
    templatesDir,
    loadConfig: vi.fn().mockResolvedValue(buildJiraConfig()),
    createPool: vi.fn().mockReturnValue({
      getConnector: vi.fn().mockReturnValue({}),
    }),
    createBulkCreator: vi.fn().mockReturnValue({ execute: mockExecute }),
  };
}

describe('handleCreateMonthlyTasks', () => {
  it('returns a structured success payload with per-project summaries', async () => {
    await writeConfig('biel', 'BIEL-2');
    await writeConfig('e8a', 'E8A-5');

    const result = await handleCreateMonthlyTasks(
      {},
      { createMonthlyDeps: buildDeps(true) },
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(
      String(result.content[0]?.text ?? '{}'),
    ) as Record<string, unknown>;

    expect(payload['success']).toBe(true);
    expect(payload['execute']).toBe(false);
    expect(payload['total_processed']).toBe(2);
    expect(payload['total_failed']).toBe(0);
    expect(payload['total_succeeded']).toBe(2);

    const configs = payload['configs'] as Array<Record<string, unknown>>;
    expect(configs).toHaveLength(2);
    expect(configs[0]?.['project_key']).toBe('BIEL');
    expect(configs[0]?.['status']).toBe('success');
    expect(configs[0]?.['dry_run']).toBe(true);
  });

  it('passes execute=true through to the underlying handler', async () => {
    await writeConfig('biel', 'BIEL-2');

    const deps = buildDeps(false);
    const result = await handleCreateMonthlyTasks(
      { execute: true },
      { createMonthlyDeps: deps },
    );

    const payload = JSON.parse(
      String(result.content[0]?.text ?? '{}'),
    ) as Record<string, unknown>;

    expect(payload['execute']).toBe(true);
    const configs = payload['configs'] as Array<Record<string, unknown>>;
    expect(configs[0]?.['dry_run']).toBe(false);

    const summary = configs[0]?.['summary'] as Record<string, number>;
    expect(summary?.['created']).toBe(1);
  });

  it('respects --project filter (case-insensitive)', async () => {
    await writeConfig('biel', 'BIEL-2');
    await writeConfig('e8a', 'E8A-5');

    const result = await handleCreateMonthlyTasks(
      { project: 'biel' },
      { createMonthlyDeps: buildDeps(true) },
    );

    const payload = JSON.parse(
      String(result.content[0]?.text ?? '{}'),
    ) as Record<string, unknown>;

    expect(payload['total_processed']).toBe(1);
    const configs = payload['configs'] as Array<Record<string, unknown>>;
    expect(configs[0]?.['project_key']).toBe('BIEL');
  });

  it('returns an empty configs payload when no templates exist', async () => {
    const result = await handleCreateMonthlyTasks(
      {},
      { createMonthlyDeps: buildDeps(true) },
    );

    const payload = JSON.parse(
      String(result.content[0]?.text ?? '{}'),
    ) as Record<string, unknown>;

    expect(payload['total_processed']).toBe(0);
    expect((payload['configs'] as unknown[]).length).toBe(0);
  });

  it('reports per-config errors without failing the whole call', async () => {
    // Write a malformed config: empty tasks array fails BulkConfigSchema
    const dir = join(templatesDir, 'broken');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'monthly_admin.json'),
      JSON.stringify({ epic_key: 'BIEL-2', tasks: [] }),
    );

    const result = await handleCreateMonthlyTasks(
      {},
      { createMonthlyDeps: buildDeps(true) },
    );

    const payload = JSON.parse(
      String(result.content[0]?.text ?? '{}'),
    ) as Record<string, unknown>;

    expect(payload['total_processed']).toBe(1);
    expect(payload['total_failed']).toBe(1);
    const configs = payload['configs'] as Array<Record<string, unknown>>;
    expect(configs[0]?.['status']).toBe('error');
    expect(String(configs[0]?.['error'])).toMatch(/Invalid config/);
  });
});
