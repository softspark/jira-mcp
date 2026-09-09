// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Boundary tests for the `confluence-mcp` CLI program structure.
 *
 * Inspects the Commander object graph and drives the `space` actions against
 * a temporary config directory. No action reaches a real Confluence site.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

vi.mock('../../src/version.js', () => ({
  VERSION: '0.0.0-test',
}));

/**
 * Config directory the registered actions write to.
 *
 * `GLOBAL_CONFIG_DIR` is computed from the home directory at module load, so
 * stubbing HOME later would not move it and the actions would read the real
 * ~/.softspark. Mocking the constant is the only way to keep these tests off
 * the developer's own configuration.
 */
let configDir = '';

vi.mock('@softspark/atlassian-mcp-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get GLOBAL_CONFIG_DIR(): string {
      return configDir;
    },
  };
});

import { createConfluenceProgram } from '../../src/cli/program.js';
import { registerSpaceCommands } from '../../src/cli/space/index.js';
import { Command as Commander } from 'commander';

function findCommand(program: Command, name: string): Command | undefined {
  return program.commands.find((cmd) => cmd.name() === name);
}

describe('createConfluenceProgram', () => {
  it('is named confluence-mcp', () => {
    expect(createConfluenceProgram().name()).toBe('confluence-mcp');
  });

  it('has a description', () => {
    expect(createConfluenceProgram().description()).toBe(
      'Confluence MCP server and CLI tools',
    );
  });

  it('registers serve and space', () => {
    const names = createConfluenceProgram().commands.map((c) => c.name());

    expect(names).toContain('serve');
    expect(names).toContain('space');
  });

  it('registers every space subcommand', () => {
    const space = findCommand(createConfluenceProgram(), 'space');

    expect(space?.commands.map((c) => c.name()).sort()).toEqual([
      'add',
      'list',
      'remove',
      'set-default',
      'set-format',
      'set-language',
    ]);
  });

  it('describes the space group as editing config.json', () => {
    const space = findCommand(createConfluenceProgram(), 'space');

    expect(space?.description()).toContain('config.json');
  });
});

describe('space command actions', () => {
  let dir: string;
  let program: Command;
  let logs: string[];
  let errors: string[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jira-mcp-cli-'));
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
      logs.push(String(msg));
    });
    vi.spyOn(console, 'error').mockImplementation((msg: unknown) => {
      errors.push(String(msg));
    });
    configDir = dir;

    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ projects: {}, default_project: '' }),
      'utf-8',
    );

    program = new Commander();
    program.exitOverride();
    registerSpaceCommands(program);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    configDir = '';
    await rm(dir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('reports an empty space list', async () => {
    await program.parseAsync(['space', 'list'], { from: 'user' });

    expect(logs.join('\n')).toContain('No spaces configured');
  });

  it('adds a space through the registered action and lists it back', async () => {
    await program.parseAsync(
      ['space', 'add', 'DOCS', 'https://test.atlassian.net'],
      { from: 'user' },
    );
    logs.length = 0;
    await program.parseAsync(['space', 'list'], { from: 'user' });

    const written = JSON.parse(
      await readFile(join(dir, 'config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(written['spaces']).toEqual({
      DOCS: { url: 'https://test.atlassian.net' },
    });
    expect(logs.join('\n')).toContain('DOCS');
  });

  it('sets the default space and the per-space language', async () => {
    await program.parseAsync(
      ['space', 'add', 'DOCS', 'https://test.atlassian.net'],
      { from: 'user' },
    );
    await program.parseAsync(['space', 'set-language', 'DOCS', 'en'], {
      from: 'user',
    });
    await program.parseAsync(['space', 'set-default', 'DOCS'], {
      from: 'user',
    });

    const written = JSON.parse(
      await readFile(join(dir, 'config.json'), 'utf-8'),
    ) as { spaces: Record<string, { language: string }>; default_space: string };
    expect(written.spaces['DOCS']?.language).toBe('en');
    expect(written.default_space).toBe('DOCS');
  });

  it('removes a space through the registered action', async () => {
    await program.parseAsync(
      ['space', 'add', 'DOCS', 'https://test.atlassian.net'],
      { from: 'user' },
    );
    await program.parseAsync(['space', 'remove', 'DOCS'], { from: 'user' });

    const written = JSON.parse(
      await readFile(join(dir, 'config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(written['spaces']).toEqual({});
  });

  it('reports a failed add and sets a non-zero exit code', async () => {
    await program.parseAsync(['space', 'add', 'bad key!', 'https://x.com'], {
      from: 'user',
    });

    expect(errors.join('\n')).toContain('Invalid space key');
    expect(process.exitCode).toBe(1);
  });

  it('reports a failed remove and sets a non-zero exit code', async () => {
    await program.parseAsync(['space', 'remove', 'GHOST'], { from: 'user' });

    expect(errors.join('\n')).toContain('not configured');
    expect(process.exitCode).toBe(1);
  });

  it('reports a failed set-language and sets a non-zero exit code', async () => {
    await program.parseAsync(['space', 'set-language', 'GHOST', 'en'], {
      from: 'user',
    });

    expect(errors.join('\n')).toContain('not configured');
    expect(process.exitCode).toBe(1);
  });

  it('reports a failure and sets a non-zero exit code', async () => {
    await program.parseAsync(['space', 'set-default', 'GHOST'], {
      from: 'user',
    });

    expect(errors.join('\n')).toContain('not configured');
    expect(process.exitCode).toBe(1);
  });
});
