// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the Confluence half of the shared configuration.
 *
 * Both products read one config.json, so the schema, the loader and the space
 * accessors all live in core and are tested here. The CLI commands that write
 * the `spaces` section are tested in the confluence-mcp package, and the
 * regression that a Jira-side write must not delete that section is tested in
 * jira-mcp, next to the writers that caused it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigFileSchema } from '../../src/config/schema';
import { getSpaceConfig, loadConfluenceConfig } from '../../src/config/loader';
import { ConfigValidationError } from '../../src/errors/index';

const CREDENTIALS = {
  username: 'user@example.com',
  api_token: 'token',
};

const BASE_CONFIG = {
  projects: { KAN: { url: 'https://test.atlassian.net' } },
  default_project: 'KAN',
  default_language: 'pl',
  spaces: { DOCS: { url: 'https://test.atlassian.net' } },
  default_space: 'DOCS',
};

describe('Confluence configuration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atlassian-mcp-conf-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(join(dir, 'config.json'), JSON.stringify(config), 'utf-8');
    await writeFile(
      join(dir, 'credentials.json'),
      JSON.stringify(CREDENTIALS),
      'utf-8',
    );
  }

  function load(): Promise<Awaited<ReturnType<typeof loadConfluenceConfig>>> {
    return loadConfluenceConfig({
      configPath: join(dir, 'config.json'),
      credentialsPath: join(dir, 'credentials.json'),
    });
  }

  // -----------------------------------------------------------------------
  // Schema
  // -----------------------------------------------------------------------

  describe('ConfigFileSchema', () => {
    it('accepts a config with no spaces section, so existing files stay valid', () => {
      const result = ConfigFileSchema.safeParse({
        projects: { KAN: { url: 'https://test.atlassian.net' } },
        default_project: 'KAN',
      });

      expect(result.success).toBe(true);
    });

    it('rejects a default_space that names no configured space', () => {
      const result = ConfigFileSchema.safeParse({
        ...BASE_CONFIG,
        default_space: 'GHOST',
      });

      expect(result.success).toBe(false);
    });

    it('rejects a space with a non-URL host', () => {
      const result = ConfigFileSchema.safeParse({
        ...BASE_CONFIG,
        spaces: { DOCS: { url: 'not-a-url' } },
      });

      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Loader
  // -----------------------------------------------------------------------

  describe('loadConfluenceConfig', () => {
    it('merges the shared credentials into every space', async () => {
      await writeConfig(BASE_CONFIG);

      const config = await load();

      expect(config.spaces['DOCS']?.username).toBe('user@example.com');
      expect(config.spaces['DOCS']?.api_token).toBe('token');
    });

    it('inherits default_language when a space sets none', async () => {
      await writeConfig(BASE_CONFIG);

      const config = await load();

      expect(config.spaces['DOCS']?.language).toBe('pl');
    });

    it('lets a space override the language', async () => {
      await writeConfig({
        ...BASE_CONFIG,
        spaces: { DOCS: { url: 'https://test.atlassian.net', language: 'en' } },
      });

      const config = await load();

      expect(config.spaces['DOCS']?.language).toBe('en');
    });

    it('fails at startup rather than on every later call when no space exists', async () => {
      await writeConfig({
        projects: { KAN: { url: 'https://test.atlassian.net' } },
        default_project: 'KAN',
      });

      await expect(load()).rejects.toThrow(ConfigValidationError);
      await expect(load()).rejects.toThrow(/No Confluence spaces configured/);
    });
  });

  // -----------------------------------------------------------------------
  // getSpaceConfig
  // -----------------------------------------------------------------------

  describe('getSpaceConfig', () => {
    it('resolves an explicit key', async () => {
      await writeConfig(BASE_CONFIG);
      const config = await load();

      expect(getSpaceConfig(config, 'DOCS')[0]).toBe('DOCS');
    });

    it('falls back to default_space', async () => {
      await writeConfig(BASE_CONFIG);
      const config = await load();

      expect(getSpaceConfig(config)[0]).toBe('DOCS');
    });

    it('refuses an unknown key and names what is configured', async () => {
      await writeConfig(BASE_CONFIG);
      const config = await load();

      expect(() => getSpaceConfig(config, 'GHOST')).toThrow(/DOCS/);
    });

    it('refuses to guess between several spaces with no default', async () => {
      await writeConfig({
        projects: { KAN: { url: 'https://test.atlassian.net' } },
        default_project: 'KAN',
        spaces: {
          DOCS: { url: 'https://a.atlassian.net' },
          KB: { url: 'https://b.atlassian.net' },
        },
      });
      const config = await load();

      expect(() => getSpaceConfig(config)).toThrow(ConfigValidationError);
    });
  });
});
