/**
 * Tests for `jira-mcp create-monthly` command handler.
 *
 * Uses a temp directory simulating the global templates structure
 * and mock dependencies to avoid hitting real Jira instances.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleCreateMonthly,
  discoverMonthlyConfigs,
} from '../../../src/cli/commands/create-monthly';
import type { CreateMonthlyDeps } from '../../../src/cli/commands/create-monthly';
import type { BulkResult } from '../../../src/bulk/types';
import type { JiraConfig } from '../../../src/config/types';

// ---------------------------------------------------------------------------
// Temp dir setup
// ---------------------------------------------------------------------------

let tempDir: string;
let templatesDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-monthly-'));
  templatesDir = join(tempDir, 'templates', 'tasks');
  await mkdir(templatesDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildValidConfig(epicKey: string): object {
  return {
    epic_key: epicKey,
    tasks: [
      {
        summary: 'Monthly task for {MONTH}',
        type: 'Task',
        priority: 'Medium',
      },
    ],
    options: {
      dry_run: true,
    },
  };
}

function buildJiraConfig(): JiraConfig {
  return {
    projects: {
      BIEL: {
        url: 'https://biel.atlassian.net',
        username: 'user@example.com',
        api_token: 'token123',
      },
      E8A: {
        url: 'https://e8a.atlassian.net',
        username: 'user@example.com',
        api_token: 'token123',
      },
    },
    default_project: 'BIEL',
    credentials: {
      username: 'user@example.com',
      api_token: 'token123',
    },
  };
}

function buildMockResult(dryRun: boolean): BulkResult {
  return {
    results: [
      {
        summary: 'Monthly task for 04.2026',
        issue_key: dryRun ? null : 'BIEL-10',
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
    total_time_ms: 100,
  };
}

async function createTemplateConfig(
  projectDir: string,
  epicKey: string,
): Promise<string> {
  const dir = join(templatesDir, projectDir);
  await mkdir(dir, { recursive: true });
  const configPath = join(dir, 'monthly_admin.json');
  await writeFile(configPath, JSON.stringify(buildValidConfig(epicKey)));
  return configPath;
}

function buildDeps(overrides?: Partial<CreateMonthlyDeps>): CreateMonthlyDeps {
  const mockExecute = vi.fn().mockResolvedValue(buildMockResult(true));

  return {
    templatesDir,
    loadConfig: vi.fn().mockResolvedValue(buildJiraConfig()),
    createPool: vi.fn().mockReturnValue({
      getConnector: vi.fn().mockReturnValue({}),
    }),
    createBulkCreator: vi.fn().mockReturnValue({ execute: mockExecute }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// discoverMonthlyConfigs
// ---------------------------------------------------------------------------

describe('discoverMonthlyConfigs', () => {
  it('discovers all monthly_admin.json files', async () => {
    await createTemplateConfig('biel', 'BIEL-2');
    await createTemplateConfig('e8a', 'E8A-5');

    const configs = await discoverMonthlyConfigs(undefined, templatesDir);

    expect(configs).toHaveLength(2);
    expect(configs[0]?.projectKey).toBe('BIEL');
    expect(configs[1]?.projectKey).toBe('E8A');
  });

  it('filters by --project key (case-insensitive)', async () => {
    await createTemplateConfig('biel', 'BIEL-2');
    await createTemplateConfig('e8a', 'E8A-5');

    const configs = await discoverMonthlyConfigs('biel', templatesDir);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.projectKey).toBe('BIEL');
  });

  it('returns empty array when templates directory does not exist', async () => {
    const nonExistent = join(tempDir, 'does-not-exist');

    const configs = await discoverMonthlyConfigs(undefined, nonExistent);

    expect(configs).toHaveLength(0);
  });

  it('skips directories without monthly_admin.json', async () => {
    await createTemplateConfig('biel', 'BIEL-2');
    // Create a directory without a monthly_admin.json
    await mkdir(join(templatesDir, 'empty-project'), { recursive: true });

    const configs = await discoverMonthlyConfigs(undefined, templatesDir);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.projectKey).toBe('BIEL');
  });

  it('returns sorted by project key', async () => {
    await createTemplateConfig('zebra', 'ZEBRA-1');
    await createTemplateConfig('alpha', 'ALPHA-1');
    await createTemplateConfig('mid', 'MID-1');

    const configs = await discoverMonthlyConfigs(undefined, templatesDir);

    const keys = configs.map((c) => c.projectKey);
    expect(keys).toEqual(['ALPHA', 'MID', 'ZEBRA']);
  });
});

// ---------------------------------------------------------------------------
// handleCreateMonthly
// ---------------------------------------------------------------------------

describe('handleCreateMonthly', () => {
  it('processes each discovered config', async () => {
    await createTemplateConfig('biel', 'BIEL-2');
    await createTemplateConfig('e8a', 'E8A-5');

    const deps = buildDeps();
    const result = await handleCreateMonthly({}, deps);

    expect(result.totalProcessed).toBe(2);
    expect(result.totalFailed).toBe(0);
    expect(result.configs).toHaveLength(2);
  });

  it('returns zero counts for empty templates dir', async () => {
    const deps = buildDeps();
    const result = await handleCreateMonthly({}, deps);

    expect(result.totalProcessed).toBe(0);
    expect(result.totalFailed).toBe(0);
    expect(result.configs).toHaveLength(0);
  });

  it('reports errors per config without aborting the batch', async () => {
    await createTemplateConfig('biel', 'BIEL-2');

    // Write an invalid config for e8a
    const e8aDir = join(templatesDir, 'e8a');
    await mkdir(e8aDir, { recursive: true });
    await writeFile(
      join(e8aDir, 'monthly_admin.json'),
      JSON.stringify({ epic_key: 'bad', tasks: [] }),
    );

    const deps = buildDeps();
    const result = await handleCreateMonthly({}, deps);

    expect(result.totalProcessed).toBe(2);
    expect(result.totalFailed).toBe(1);

    const failedConfig = result.configs.find(
      (c) => c.projectKey === 'E8A',
    );
    expect(failedConfig?.error).toBeDefined();

    const successConfig = result.configs.find(
      (c) => c.projectKey === 'BIEL',
    );
    expect(successConfig?.result).toBeDefined();
    expect(successConfig?.error).toBeUndefined();
  });

  it('filters by --project option', async () => {
    await createTemplateConfig('biel', 'BIEL-2');
    await createTemplateConfig('e8a', 'E8A-5');

    const deps = buildDeps();
    const result = await handleCreateMonthly(
      { project: 'BIEL' },
      deps,
    );

    expect(result.totalProcessed).toBe(1);
    expect(result.configs[0]?.projectKey).toBe('BIEL');
  });

  it('applies --execute flag to each config', async () => {
    await createTemplateConfig('biel', 'BIEL-2');

    const mockExecute = vi.fn().mockResolvedValue(buildMockResult(false));
    const deps = buildDeps({
      createBulkCreator: vi.fn().mockReturnValue({
        execute: mockExecute,
      }),
    });

    await handleCreateMonthly({ execute: true }, deps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ dry_run: false }),
      }),
    );
  });
});
