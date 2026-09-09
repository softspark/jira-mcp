// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `jira-mcp config set-default` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleSetDefault } from '../../../../src/cli/commands/config/set-default';

let tempDir: string;

async function setupConfig(defaultProject: string): Promise<void> {
  const config = {
    projects: {
      KAN: { url: 'https://test.atlassian.net' },
      PROJ: { url: 'https://other.atlassian.net' },
    },
    default_project: defaultProject,
  };
  await writeFile(join(tempDir, 'config.json'), JSON.stringify(config));
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-set-default-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleSetDefault', () => {
  it('updates default_project for a configured project', async () => {
    await setupConfig('KAN');

    await handleSetDefault(tempDir, 'PROJ');

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
    const updated = JSON.parse(raw) as { default_project: string };
    expect(updated.default_project).toBe('PROJ');
  });

  it('preserves the projects map when updating', async () => {
    await setupConfig('KAN');

    await handleSetDefault(tempDir, 'PROJ');

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
    const updated = JSON.parse(raw) as {
      projects: Record<string, { url: string }>;
    };
    expect(Object.keys(updated.projects)).toEqual(['KAN', 'PROJ']);
  });

  it('rejects a project key that is not configured', async () => {
    await setupConfig('KAN');

    await expect(handleSetDefault(tempDir, 'NOPE')).rejects.toThrow(
      /not configured/,
    );
  });

  it('rejects when config.json does not exist', async () => {
    await expect(handleSetDefault(tempDir, 'KAN')).rejects.toThrow();
  });
});
