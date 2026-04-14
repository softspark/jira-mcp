/**
 * Tests for `jira-mcp create` command handler.
 *
 * Uses a temp directory for config files and mock dependencies
 * to avoid hitting real Jira instances.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleCreate,
  resolveConfigPath,
} from '../../../src/cli/commands/create';
import type { CreateDeps } from '../../../src/cli/commands/create';
import type { BulkResult } from '../../../src/bulk/types';
import type { JiraConfig } from '../../../src/config/types';

// ---------------------------------------------------------------------------
// Temp dir setup
// ---------------------------------------------------------------------------

let tempDir: string;
let templatesDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-create-'));
  templatesDir = join(tempDir, 'templates');
  await mkdir(templatesDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CONFIG = {
  epic_key: 'BIEL-2',
  tasks: [
    {
      summary: 'Task for {MONTH}',
      type: 'Task',
      priority: 'Medium',
    },
  ],
  options: {
    dry_run: true,
  },
};

function buildJiraConfig(): JiraConfig {
  return {
    projects: {
      BIEL: {
        url: 'https://biel.atlassian.net',
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
        summary: 'Task for 04.2026',
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

function buildDeps(overrides?: Partial<CreateDeps>): CreateDeps {
  const mockConnector = {
    getConnector: vi.fn().mockReturnValue({}),
  };

  const mockExecute = vi.fn().mockResolvedValue(buildMockResult(true));

  return {
    templatesDir,
    loadConfig: vi.fn().mockResolvedValue(buildJiraConfig()),
    createPool: vi.fn().mockReturnValue(mockConnector),
    createBulkCreator: vi.fn().mockReturnValue({ execute: mockExecute }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveConfigPath
// ---------------------------------------------------------------------------

describe('resolveConfigPath', () => {
  it('resolves a relative path with .json extension', async () => {
    const configFile = join(tempDir, 'my-config.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const resolved = await resolveConfigPath(configFile, templatesDir);

    expect(resolved).toBe(configFile);
  });

  it('resolves a path without .json by appending the extension', async () => {
    const configFile = join(tempDir, 'my-config.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const inputWithoutExt = join(tempDir, 'my-config');
    const resolved = await resolveConfigPath(inputWithoutExt, templatesDir);

    expect(resolved).toBe(configFile);
  });

  it('resolves a template reference from the templates directory', async () => {
    const projectDir = join(templatesDir, 'biel');
    await mkdir(projectDir, { recursive: true });
    const configFile = join(projectDir, 'monthly_admin.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const resolved = await resolveConfigPath(
      'biel/monthly_admin',
      templatesDir,
    );

    expect(resolved).toBe(configFile);
  });

  it('throws when config is not found anywhere', async () => {
    await expect(
      resolveConfigPath('nonexistent/config', templatesDir),
    ).rejects.toThrow('Config not found');
  });
});

// ---------------------------------------------------------------------------
// handleCreate
// ---------------------------------------------------------------------------

describe('handleCreate', () => {
  it('defaults to dry_run=true when --execute is not set', async () => {
    const configFile = join(tempDir, 'test.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const deps = buildDeps();
    await handleCreate(configFile, {}, deps);

    const createBulkCreator = deps.createBulkCreator!;
    const mockCreator = createBulkCreator(
      {} as never,
      'BIEL',
    ) as { execute: ReturnType<typeof vi.fn> };
    // The execute was called -- verify the first call had dry_run=true
    const executeCalls = mockCreator.execute.mock.calls;
    expect(executeCalls.length).toBeGreaterThan(0);
    expect(executeCalls[0]?.[0]?.options?.dry_run).toBe(true);
  });

  it('sets dry_run=false when --execute is provided', async () => {
    const configFile = join(tempDir, 'test.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const mockExecute = vi.fn().mockResolvedValue(buildMockResult(false));
    const deps = buildDeps({
      createBulkCreator: vi.fn().mockReturnValue({ execute: mockExecute }),
    });

    await handleCreate(configFile, { execute: true }, deps);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ dry_run: false }),
      }),
    );
  });

  it('applies placeholder replacement', async () => {
    const configFile = join(tempDir, 'test.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const mockExecute = vi.fn().mockResolvedValue(buildMockResult(true));
    const deps = buildDeps({
      createBulkCreator: vi.fn().mockReturnValue({ execute: mockExecute }),
    });

    await handleCreate(configFile, {}, deps);

    const callArg = mockExecute.mock.calls[0]?.[0] as {
      tasks: readonly { summary: string }[];
    };
    // The {MONTH} placeholder should have been replaced
    expect(callArg.tasks[0]?.summary).not.toContain('{MONTH}');
    expect(callArg.tasks[0]?.summary).toMatch(/\d{2}\.\d{4}/);
  });

  it('rejects invalid config with schema validation error', async () => {
    const configFile = join(tempDir, 'invalid.json');
    await writeFile(
      configFile,
      JSON.stringify({ epic_key: 'bad', tasks: [] }),
    );

    const deps = buildDeps();

    await expect(
      handleCreate(configFile, {}, deps),
    ).rejects.toThrow('Invalid config');
  });

  it('extracts project key from epic_key', async () => {
    const configFile = join(tempDir, 'test.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const mockCreatePool = vi.fn().mockReturnValue({
      getConnector: vi.fn().mockReturnValue({}),
    });
    const mockCreateBulk = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(buildMockResult(true)),
    });

    const deps = buildDeps({
      createPool: mockCreatePool,
      createBulkCreator: mockCreateBulk,
    });

    await handleCreate(configFile, {}, deps);

    // getConnector should have been called with the project key
    const pool = mockCreatePool.mock.results[0]?.value as {
      getConnector: ReturnType<typeof vi.fn>;
    };
    expect(pool.getConnector).toHaveBeenCalledWith('BIEL');

    // createBulkCreator should have received the project key
    expect(mockCreateBulk).toHaveBeenCalledWith(
      expect.anything(),
      'BIEL',
    );
  });

  it('returns the bulk result', async () => {
    const configFile = join(tempDir, 'test.json');
    await writeFile(configFile, JSON.stringify(VALID_CONFIG));

    const expected = buildMockResult(true);
    const deps = buildDeps({
      createBulkCreator: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(expected),
      }),
    });

    const result = await handleCreate(configFile, {}, deps);

    expect(result.dry_run).toBe(true);
    expect(result.results).toHaveLength(1);
  });
});
