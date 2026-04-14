/**
 * Tests for `jira-mcp config init` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleInit } from '../../../../src/cli/commands/config/init';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-init-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('handleInit', () => {
  it('creates the full directory structure', async () => {
    const configDir = join(tempDir, 'jira-mcp');

    await handleInit(configDir);

    expect(await pathExists(configDir)).toBe(true);
    expect(await pathExists(join(configDir, 'cache'))).toBe(true);
    expect(await pathExists(join(configDir, 'templates', 'tasks'))).toBe(true);
  });

  it('creates skeleton config.json', async () => {
    const configDir = join(tempDir, 'jira-mcp');

    await handleInit(configDir);

    const raw = await readFile(join(configDir, 'config.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    expect(parsed).toEqual({
      projects: {},
      default_project: '',
    });
  });

  it('creates skeleton credentials.json', async () => {
    const configDir = join(tempDir, 'jira-mcp');

    await handleInit(configDir);

    const raw = await readFile(join(configDir, 'credentials.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    expect(parsed).toEqual({
      username: '',
      api_token: '',
    });
  });

  it('creates skeleton state.json with correct version', async () => {
    const configDir = join(tempDir, 'jira-mcp');

    await handleInit(configDir);

    const raw = await readFile(join(configDir, 'state.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    expect(parsed).toEqual({ version: '0.3.0' });
  });

  it('does not overwrite existing files', async () => {
    const configDir = join(tempDir, 'jira-mcp');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      '{"projects":{"EXISTING":{"url":"https://existing.test"}},"default_project":"EXISTING"}',
    );

    await handleInit(configDir);

    const raw = await readFile(join(configDir, 'config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { default_project: string };

    expect(parsed.default_project).toBe('EXISTING');
  });

  it('reports created and skipped items correctly', async () => {
    const configDir = join(tempDir, 'jira-mcp');
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, 'config.json'), '{}');

    const results = await handleInit(configDir);

    const skippedDir = results.find(
      (r) => r.path === configDir && r.kind === 'directory',
    );
    expect(skippedDir?.action).toBe('skipped');

    const skippedFile = results.find(
      (r) => r.path === join(configDir, 'config.json') && r.kind === 'file',
    );
    expect(skippedFile?.action).toBe('skipped');

    const createdCredentials = results.find(
      (r) => r.path === join(configDir, 'credentials.json') && r.kind === 'file',
    );
    expect(createdCredentials?.action).toBe('created');
  });
});
