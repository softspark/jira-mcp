/**
 * Tests for `jira-mcp config list-projects` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleListProjects } from '../../../../src/cli/commands/config/list-projects';

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

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-list-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleListProjects', () => {
  it('lists all configured projects with URLs', async () => {
    const configDir = await setupConfigDir(
      {
        PROJ_A: { url: 'https://a.atlassian.net' },
        PROJ_B: { url: 'https://b.atlassian.net' },
      },
      'PROJ_A',
    );

    const rows = await handleListProjects(configDir);

    expect(rows).toHaveLength(2);

    const projA = rows.find((r) => r.key === 'PROJ_A');
    expect(projA?.url).toBe('https://a.atlassian.net');
    expect(projA?.isDefault).toBe(true);

    const projB = rows.find((r) => r.key === 'PROJ_B');
    expect(projB?.url).toBe('https://b.atlassian.net');
    expect(projB?.isDefault).toBe(false);
  });

  it('returns empty array for config with no projects', async () => {
    const configDir = await setupConfigDir({}, '');

    const rows = await handleListProjects(configDir);

    expect(rows).toHaveLength(0);
  });

  it('marks the default project correctly', async () => {
    const configDir = await setupConfigDir(
      {
        X: { url: 'https://x.atlassian.net' },
        Y: { url: 'https://y.atlassian.net' },
        Z: { url: 'https://z.atlassian.net' },
      },
      'Y',
    );

    const rows = await handleListProjects(configDir);

    const defaults = rows.filter((r) => r.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.key).toBe('Y');
  });

  it('shows language from default when not set per project', async () => {
    const configDir = await setupConfigDir(
      { PROJ: { url: 'https://test.atlassian.net' } },
      'PROJ',
    );

    const rows = await handleListProjects(configDir);

    expect(rows[0]?.language).toBe('pl');
    expect(rows[0]?.languageSource).toBe('default');
  });

  it('shows per-project language override', async () => {
    const configDir = join(tempDir, 'jira-mcp-lang');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        projects: {
          A: { url: 'https://a.atlassian.net', language: 'en' },
          B: { url: 'https://b.atlassian.net' },
        },
        default_project: 'A',
        default_language: 'de',
      }),
    );

    const rows = await handleListProjects(configDir);

    const a = rows.find((r) => r.key === 'A');
    expect(a?.language).toBe('en');
    expect(a?.languageSource).toBe('project');

    const b = rows.find((r) => r.key === 'B');
    expect(b?.language).toBe('de');
    expect(b?.languageSource).toBe('default');
  });
});
