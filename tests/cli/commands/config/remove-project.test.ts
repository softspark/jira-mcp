/**
 * Tests for `jira-mcp config remove-project` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleRemoveProject } from '../../../../src/cli/commands/config/remove-project';

let tempDir: string;

async function setupConfigDir(
  projects: Record<string, { url: string }>,
  defaultProject: string,
): Promise<string> {
  const configDir = join(tempDir, 'jira-mcp');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, 'config.json'),
    JSON.stringify({ projects, default_project: defaultProject }),
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
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-rm-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleRemoveProject', () => {
  it('removes a project from config.json', async () => {
    const configDir = await setupConfigDir(
      {
        PROJ: { url: 'https://proj.atlassian.net' },
        OTHER: { url: 'https://other.atlassian.net' },
      },
      'OTHER',
    );

    await handleRemoveProject(configDir, 'PROJ');

    const config = await readConfig(configDir);
    expect(config.projects['PROJ']).toBeUndefined();
    expect(config.projects['OTHER']).toBeDefined();
  });

  it('clears default_project when removing the default', async () => {
    const configDir = await setupConfigDir(
      { DEFAULT: { url: 'https://default.atlassian.net' } },
      'DEFAULT',
    );

    const { defaultCleared } = await handleRemoveProject(configDir, 'DEFAULT');

    const config = await readConfig(configDir);
    expect(config.default_project).toBe('');
    expect(defaultCleared).toBe(true);
  });

  it('preserves default_project when removing a non-default project', async () => {
    const configDir = await setupConfigDir(
      {
        KEEP: { url: 'https://keep.atlassian.net' },
        REMOVE: { url: 'https://remove.atlassian.net' },
      },
      'KEEP',
    );

    const { defaultCleared } = await handleRemoveProject(configDir, 'REMOVE');

    const config = await readConfig(configDir);
    expect(config.default_project).toBe('KEEP');
    expect(defaultCleared).toBe(false);
  });

  it('throws an error for unknown project key', async () => {
    const configDir = await setupConfigDir({}, '');

    await expect(
      handleRemoveProject(configDir, 'UNKNOWN'),
    ).rejects.toThrow('Project "UNKNOWN" is not configured');
  });
});
