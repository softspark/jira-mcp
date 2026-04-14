/**
 * Tests for `jira-mcp config set-language` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleSetLanguage, handleSetProjectLanguage } from '../../../../src/cli/commands/config/set-language';

describe('handleSetLanguage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-test-'));
    await writeFile(
      join(tempDir, 'config.json'),
      JSON.stringify({
        projects: { PROJ: { url: 'https://test.atlassian.net' } },
        default_project: 'PROJ',
      }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('sets default_language in config.json', async () => {
    await handleSetLanguage(tempDir, 'en');

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    expect(config['default_language']).toBe('en');
  });

  it('accepts all supported languages', async () => {
    for (const lang of ['pl', 'en', 'de', 'es', 'fr', 'pt', 'it', 'nl']) {
      await handleSetLanguage(tempDir, lang);

      const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      expect(config['default_language']).toBe(lang);
    }
  });

  it('rejects unsupported language', async () => {
    await expect(handleSetLanguage(tempDir, 'xx')).rejects.toThrow(
      'Invalid language "xx"',
    );
  });

  it('preserves existing config fields', async () => {
    await handleSetLanguage(tempDir, 'de');

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    expect(config['default_project']).toBe('PROJ');
    expect(config['default_language']).toBe('de');
  });
});

describe('handleSetProjectLanguage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-test-'));
    await writeFile(
      join(tempDir, 'config.json'),
      JSON.stringify({
        projects: {
          DEVOPS: { url: 'https://devops.atlassian.net' },
          ADMIN: { url: 'https://admin.atlassian.net' },
        },
        default_project: 'DEVOPS',
      }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('sets language for a specific project', async () => {
    await handleSetProjectLanguage(tempDir, 'DEVOPS', 'en');

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8');
    const config = JSON.parse(raw) as {
      projects: Record<string, { url: string; language?: string }>;
    };
    expect(config.projects['DEVOPS']?.language).toBe('en');
    expect(config.projects['ADMIN']?.language).toBeUndefined();
  });

  it('rejects unknown project', async () => {
    await expect(
      handleSetProjectLanguage(tempDir, 'NOPE', 'en'),
    ).rejects.toThrow('Project "NOPE" is not configured');
  });

  it('rejects invalid language for project', async () => {
    await expect(
      handleSetProjectLanguage(tempDir, 'DEVOPS', 'xx'),
    ).rejects.toThrow('Invalid language "xx"');
  });
});
