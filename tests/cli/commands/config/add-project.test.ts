/**
 * Tests for `jira-mcp config add-project` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleAddProject } from '../../../../src/cli/commands/config/add-project';

let tempDir: string;

async function setupConfigDir(): Promise<string> {
  const configDir = join(tempDir, 'jira-mcp');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({ projects: {}, default_project: '' }),
  );
  return configDir;
}

async function readConfig(configDir: string): Promise<{
  projects: Record<string, { url: string }>;
  default_project: string;
}> {
  const raw = await readFile(join(configDir, 'config.json'), 'utf-8');
  return JSON.parse(raw) as {
    projects: Record<string, { url: string }>;
    default_project: string;
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-add-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleAddProject', () => {
  it('adds a project to config.json', async () => {
    const configDir = await setupConfigDir();

    await handleAddProject(configDir, 'PROJ', 'https://proj.atlassian.net');

    const config = await readConfig(configDir);
    expect(config.projects['PROJ']).toEqual({
      url: 'https://proj.atlassian.net',
    });
  });

  it('sets default_project when adding the first project', async () => {
    const configDir = await setupConfigDir();

    await handleAddProject(configDir, 'FIRST', 'https://first.atlassian.net');

    const config = await readConfig(configDir);
    expect(config.default_project).toBe('FIRST');
  });

  it('does not change default_project when adding a second project', async () => {
    const configDir = await setupConfigDir();

    await handleAddProject(configDir, 'FIRST', 'https://first.atlassian.net');
    await handleAddProject(configDir, 'SECOND', 'https://second.atlassian.net');

    const config = await readConfig(configDir);
    expect(config.default_project).toBe('FIRST');
    expect(Object.keys(config.projects)).toHaveLength(2);
  });

  it('rejects invalid project key format', async () => {
    const configDir = await setupConfigDir();

    await expect(
      handleAddProject(configDir, 'lower', 'https://test.atlassian.net'),
    ).rejects.toThrow('Invalid project key');

    await expect(
      handleAddProject(configDir, '123', 'https://test.atlassian.net'),
    ).rejects.toThrow('Invalid project key');

    await expect(
      handleAddProject(configDir, 'HAS SPACE', 'https://test.atlassian.net'),
    ).rejects.toThrow('Invalid project key');
  });

  it('rejects URLs not starting with https://', async () => {
    const configDir = await setupConfigDir();

    await expect(
      handleAddProject(configDir, 'PROJ', 'http://insecure.atlassian.net'),
    ).rejects.toThrow('Invalid URL');

    await expect(
      handleAddProject(configDir, 'PROJ', 'ftp://other.net'),
    ).rejects.toThrow('Invalid URL');
  });
});
