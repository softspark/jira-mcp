/**
 * Boundary tests for the CLI program structure.
 *
 * Validates that `createProgram()` returns a Commander program with the
 * correct name, version, and the full set of registered commands and
 * subcommands. These tests inspect the Commander object graph -- they do
 * NOT invoke any actions or hit external APIs.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Command } from 'commander';

vi.mock('../../src/version.js', () => ({
  VERSION: '0.0.0-test',
}));

import { createProgram } from '../../src/cli/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a top-level subcommand by name. */
function findCommand(program: Command, name: string): Command | undefined {
  return program.commands.find((cmd) => cmd.name() === name);
}

/** Get all subcommand names for a command. */
function subcommandNames(cmd: Command): readonly string[] {
  return cmd.commands.map((c) => c.name());
}

// ---------------------------------------------------------------------------
// createProgram() basics
// ---------------------------------------------------------------------------

describe('createProgram', () => {
  it('returns a Command instance', () => {
    const program = createProgram();

    expect(program).toBeDefined();
    expect(program.name()).toBe('jira-mcp');
  });

  it('has the correct program name', () => {
    const program = createProgram();

    expect(program.name()).toBe('jira-mcp');
  });

  it('has a description set', () => {
    const program = createProgram();

    expect(program.description()).toBe('Jira MCP server and CLI tools');
  });

  it('has a version string set', () => {
    const program = createProgram();

    expect(program.version()).toBe('0.0.0-test');
  });
});

// ---------------------------------------------------------------------------
// Top-level commands
// ---------------------------------------------------------------------------

describe('top-level commands', () => {
  it('registers the serve command', () => {
    const program = createProgram();
    const serve = findCommand(program, 'serve');

    expect(serve).toBeDefined();
    expect(serve!.description()).toBe('Start the MCP server (default behavior)');
  });

  it('registers the config command group', () => {
    const program = createProgram();
    const config = findCommand(program, 'config');

    expect(config).toBeDefined();
    expect(config!.description()).toBe('Manage Jira configuration');
  });

  it('registers the cache command group', () => {
    const program = createProgram();
    const cache = findCommand(program, 'cache');

    expect(cache).toBeDefined();
    expect(cache!.description()).toBe('Manage workflow and user caches');
  });

  it('registers the create command', () => {
    const program = createProgram();
    const create = findCommand(program, 'create');

    expect(create).toBeDefined();
    expect(create!.description()).toContain('Create tasks from a bulk config file');
  });

  it('registers the create-monthly command', () => {
    const program = createProgram();
    const createMonthly = findCommand(program, 'create-monthly');

    expect(createMonthly).toBeDefined();
    expect(createMonthly!.description()).toContain('monthly_admin.json');
  });

  it('has exactly 5 top-level commands', () => {
    const program = createProgram();
    const names = subcommandNames(program);

    expect(names).toHaveLength(5);
    expect(names).toEqual(
      expect.arrayContaining([
        'serve',
        'config',
        'cache',
        'create',
        'create-monthly',
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Config subcommands
// ---------------------------------------------------------------------------

describe('config subcommands', () => {
  const EXPECTED_CONFIG_SUBCOMMANDS = [
    'init',
    'add-project',
    'remove-project',
    'list-projects',
    'set-credentials',
    'set-default',
    'set-language',
    'set-project-language',
  ] as const;

  it('has exactly 8 config subcommands', () => {
    const program = createProgram();
    const config = findCommand(program, 'config')!;

    expect(config.commands).toHaveLength(8);
  });

  it.each(EXPECTED_CONFIG_SUBCOMMANDS)(
    'registers the "%s" config subcommand',
    (name) => {
      const program = createProgram();
      const config = findCommand(program, 'config')!;
      const sub = config.commands.find((c) => c.name() === name);

      expect(sub).toBeDefined();
      expect(sub!.description()).toBeTruthy();
    },
  );

  it('contains all expected config subcommands', () => {
    const program = createProgram();
    const config = findCommand(program, 'config')!;
    const names = subcommandNames(config);

    expect(names).toEqual(
      expect.arrayContaining([...EXPECTED_CONFIG_SUBCOMMANDS]),
    );
  });
});

// ---------------------------------------------------------------------------
// Cache subcommands
// ---------------------------------------------------------------------------

describe('cache subcommands', () => {
  const EXPECTED_CACHE_SUBCOMMANDS = [
    'sync-workflows',
    'sync-users',
    'list-workflows',
    'list-users',
  ] as const;

  it('has exactly 4 cache subcommands', () => {
    const program = createProgram();
    const cache = findCommand(program, 'cache')!;

    expect(cache.commands).toHaveLength(4);
  });

  it.each(EXPECTED_CACHE_SUBCOMMANDS)(
    'registers the "%s" cache subcommand',
    (name) => {
      const program = createProgram();
      const cache = findCommand(program, 'cache')!;
      const sub = cache.commands.find((c) => c.name() === name);

      expect(sub).toBeDefined();
      expect(sub!.description()).toBeTruthy();
    },
  );

  it('contains all expected cache subcommands', () => {
    const program = createProgram();
    const cache = findCommand(program, 'cache')!;
    const names = subcommandNames(cache);

    expect(names).toEqual(
      expect.arrayContaining([...EXPECTED_CACHE_SUBCOMMANDS]),
    );
  });
});

// ---------------------------------------------------------------------------
// Total command count
// ---------------------------------------------------------------------------

describe('total command count', () => {
  it('has 17 total commands (5 top-level + 8 config + 4 cache)', () => {
    const program = createProgram();
    const config = findCommand(program, 'config')!;
    const cache = findCommand(program, 'cache')!;

    const topLevel = program.commands.length;
    const configSubs = config.commands.length;
    const cacheSubs = cache.commands.length;
    const total = topLevel + configSubs + cacheSubs;

    expect(topLevel).toBe(5);
    expect(configSubs).toBe(8);
    expect(cacheSubs).toBe(4);
    expect(total).toBe(17);
  });
});
