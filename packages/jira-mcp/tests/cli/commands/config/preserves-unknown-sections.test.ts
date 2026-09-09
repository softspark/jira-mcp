// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Regression: a Jira-side config write must not delete anybody else's section.
 *
 * `config add-project` and `config remove-project` used to rebuild config.json
 * from the two fields they knew about. That already discarded
 * `default_language`, and once Confluence started keeping its `spaces` section
 * in the same file, the same code would have deleted the entire Confluence
 * configuration as a side effect of adding a Jira project.
 *
 * The fixture deliberately contains sections this package knows nothing about.
 * That is the point: the writers must preserve what they do not understand.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleAddProject } from '../../../../src/cli/commands/config/add-project';
import { handleRemoveProject } from '../../../../src/cli/commands/config/remove-project';

const CONFIG_WITH_FOREIGN_SECTIONS = {
  projects: { KAN: { url: 'https://test.atlassian.net' } },
  default_project: 'KAN',
  default_language: 'pl',
  spaces: { DOCS: { url: 'https://test.atlassian.net' } },
  default_space: 'DOCS',
};

describe('Jira config writers preserve unknown sections', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jira-mcp-preserve-'));
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify(CONFIG_WITH_FOREIGN_SECTIONS),
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function readConfig(): Promise<Record<string, unknown>> {
    const raw = await readFile(join(dir, 'config.json'), 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('keeps the Confluence spaces section when a project is added', async () => {
    await handleAddProject(dir, 'NEW', 'https://test.atlassian.net');

    const config = await readConfig();
    expect(config['spaces']).toEqual({
      DOCS: { url: 'https://test.atlassian.net' },
    });
    expect(config['default_space']).toBe('DOCS');
  });

  it('keeps default_language when a project is added', async () => {
    await handleAddProject(dir, 'NEW', 'https://test.atlassian.net');

    expect((await readConfig())['default_language']).toBe('pl');
  });

  it('keeps the Confluence spaces section when a project is removed', async () => {
    await handleRemoveProject(dir, 'KAN');

    const config = await readConfig();
    expect(config['spaces']).toEqual({
      DOCS: { url: 'https://test.atlassian.net' },
    });
    expect(config['default_space']).toBe('DOCS');
  });

  it('keeps default_language when a project is removed', async () => {
    await handleRemoveProject(dir, 'KAN');

    expect((await readConfig())['default_language']).toBe('pl');
  });
});
