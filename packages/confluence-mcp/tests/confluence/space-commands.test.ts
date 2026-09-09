// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Tests for the `confluence-mcp space` command handlers.
 *
 * These write the `spaces` section of the shared config.json. The schema and
 * loader that read it back are tested in the core package; the regression
 * that a Jira-side write must not delete this section is tested in jira-mcp.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  handleAddSpace,
  handleListSpaces,
  handleRemoveSpace,
  handleSetDefaultSpace,
  handleSetSpaceFormat,
  handleSetSpaceLanguage,
} from '../../src/cli/space/index';

const BASE_CONFIG = {
  projects: { KAN: { url: 'https://test.atlassian.net' } },
  default_project: 'KAN',
  default_language: 'pl',
  spaces: { DOCS: { url: 'https://test.atlassian.net' } },
  default_space: 'DOCS',
};

describe('space CLI commands', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'confluence-mcp-space-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config), 'utf-8');
  }

  async function readConfig(): Promise<Record<string, unknown>> {
    const raw = await readFile(join(dir, 'config.json'), 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('adds a space and makes the first one the default', async () => {
    await writeConfig({ projects: {}, default_project: '' });

    await handleAddSpace(dir, 'DOCS', 'https://test.atlassian.net');

    const config = await readConfig();
    expect(config['default_space']).toBe('DOCS');
    expect(config['spaces']).toEqual({
      DOCS: { url: 'https://test.atlassian.net' },
    });
  });

  it('keeps the existing default when adding a second space', async () => {
    await writeConfig(BASE_CONFIG);

    await handleAddSpace(dir, 'KB', 'https://test.atlassian.net');

    expect((await readConfig())['default_space']).toBe('DOCS');
  });

  it.each(['DevOps', 'DOCS', 'KB1', 'My_Space', 'docs', '~lukasz'])(
    'accepts the real-world space key %s',
    async (key) => {
      // Confluence keeps the case a space was created with, unlike a Jira
      // project key. Rejecting mixed case would reject real spaces.
      await writeConfig({ projects: {}, default_project: '' });

      await handleAddSpace(dir, key, 'https://test.atlassian.net');

      expect(Object.keys((await readConfig())['spaces'] as object)).toContain(
        key,
      );
    },
  );

  it.each(['has space', 'DOCS!', 'a/b', ''])(
    'rejects the malformed space key %j',
    async (key) => {
      await writeConfig(BASE_CONFIG);

      await expect(
        handleAddSpace(dir, key, 'https://test.atlassian.net'),
      ).rejects.toThrow(/Invalid space key/);
    },
  );

  it('rejects a non-https URL', async () => {
    await writeConfig(BASE_CONFIG);

    await expect(
      handleAddSpace(dir, 'KB', 'http://test.atlassian.net'),
    ).rejects.toThrow(/must start with https/);
  });

  it('promotes a survivor instead of leaving a dangling default', async () => {
    await writeConfig({
      ...BASE_CONFIG,
      spaces: {
        DOCS: { url: 'https://test.atlassian.net' },
        KB: { url: 'https://test.atlassian.net' },
      },
    });

    const { defaultCleared } = await handleRemoveSpace(dir, 'DOCS');

    expect(defaultCleared).toBe(true);
    expect((await readConfig())['default_space']).toBe('KB');
  });

  it('drops default_space entirely when the last space goes', async () => {
    await writeConfig(BASE_CONFIG);

    await handleRemoveSpace(dir, 'DOCS');

    const config = await readConfig();
    expect(config['spaces']).toEqual({});
    expect('default_space' in config).toBe(false);
  });

  it('refuses to remove a space that is not configured', async () => {
    await writeConfig(BASE_CONFIG);

    await expect(handleRemoveSpace(dir, 'GHOST')).rejects.toThrow(
      /not configured/,
    );
  });

  it('sets the default space', async () => {
    await writeConfig({
      ...BASE_CONFIG,
      spaces: {
        DOCS: { url: 'https://test.atlassian.net' },
        KB: { url: 'https://test.atlassian.net' },
      },
    });

    await handleSetDefaultSpace(dir, 'KB');

    expect((await readConfig())['default_space']).toBe('KB');
  });

  it('refuses to default to an unconfigured space', async () => {
    await writeConfig(BASE_CONFIG);

    await expect(handleSetDefaultSpace(dir, 'GHOST')).rejects.toThrow(
      /not configured/,
    );
  });

  it('sets a per-space language', async () => {
    await writeConfig(BASE_CONFIG);

    await handleSetSpaceLanguage(dir, 'DOCS', 'en');

    const spaces = (await readConfig())['spaces'] as Record<
      string,
      { language: string }
    >;
    expect(spaces['DOCS']?.language).toBe('en');
  });

  it('rejects an unsupported language', async () => {
    await writeConfig(BASE_CONFIG);

    await expect(handleSetSpaceLanguage(dir, 'DOCS', 'kl')).rejects.toThrow(
      /Invalid language/,
    );
  });

  it('lists spaces with inherited language and format marked', async () => {
    await writeConfig(BASE_CONFIG);

    const rows = await handleListSpaces(dir);

    expect(rows).toEqual([
      [
        'DOCS',
        'https://test.atlassian.net',
        'pl (inherited)',
        'markdown (inherited)',
        'yes',
      ],
    ]);
  });

  describe('set-format', () => {
    it('sets the body format for one space', async () => {
      await writeConfig(BASE_CONFIG);

      await handleSetSpaceFormat(dir, 'DOCS', 'storage');

      const spaces = (await readConfig())['spaces'] as Record<
        string,
        { format: string }
      >;
      expect(spaces['DOCS']?.format).toBe('storage');
    });

    it('shows the explicit format in the listing', async () => {
      await writeConfig(BASE_CONFIG);
      await handleSetSpaceFormat(dir, 'DOCS', 'storage');

      const rows = await handleListSpaces(dir);

      expect(rows[0]?.[3]).toBe('storage');
    });

    it('rejects a format that is not markdown or storage', async () => {
      await writeConfig(BASE_CONFIG);

      await expect(handleSetSpaceFormat(dir, 'DOCS', 'html')).rejects.toThrow(
        /Invalid format/,
      );
    });

    it('refuses a space that is not configured', async () => {
      await writeConfig(BASE_CONFIG);

      await expect(
        handleSetSpaceFormat(dir, 'GHOST', 'storage'),
      ).rejects.toThrow(/not configured/);
    });

    it('keeps the language when the format changes', async () => {
      await writeConfig(BASE_CONFIG);
      await handleSetSpaceLanguage(dir, 'DOCS', 'en');

      await handleSetSpaceFormat(dir, 'DOCS', 'storage');

      const spaces = (await readConfig())['spaces'] as Record<
        string,
        { language: string; format: string }
      >;
      expect(spaces['DOCS']).toEqual({
        url: 'https://test.atlassian.net',
        language: 'en',
        format: 'storage',
      });
    });
  });

  it('keeps the Jira projects section when a space is added', async () => {
    await writeConfig(BASE_CONFIG);

    await handleAddSpace(dir, 'KB', 'https://test.atlassian.net');

    const config = await readConfig();
    expect(config['projects']).toEqual({
      KAN: { url: 'https://test.atlassian.net' },
    });
    expect(config['default_project']).toBe('KAN');
  });
});
