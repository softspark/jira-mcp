// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for CLI output helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { info, warn, error, table } from '../../src/cli/output';

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('info', () => {
  it('prints the message to stdout', () => {
    info('hello');

    expect(logSpy).toHaveBeenCalledWith('hello');
  });
});

describe('warn', () => {
  it('prefixes the message with Warning:', () => {
    warn('cache stale');

    expect(warnSpy).toHaveBeenCalledWith('Warning: cache stale');
  });
});

describe('error', () => {
  it('prefixes the message with Error:', () => {
    error('boom');

    expect(errorSpy).toHaveBeenCalledWith('Error: boom');
  });
});

describe('table', () => {
  it('pads columns to the widest value', () => {
    table(['Key', 'Name'], [
      ['KAN', 'Kanban'],
      ['LONGKEY', 'X'],
    ]);

    const lines = logSpy.mock.calls.map((call) => call[0] as string);
    expect(lines[0]).toBe('Key      Name  ');
    expect(lines[1]).toBe('-------  ------');
    expect(lines[2]).toBe('KAN      Kanban');
    expect(lines[3]).toBe('LONGKEY  X     ');
  });

  it('handles rows shorter than the header row', () => {
    table(['A', 'B'], [['only-a']]);

    const lines = logSpy.mock.calls.map((call) => call[0] as string);
    expect(lines[2]).toBe('only-a');
  });

  it('renders headers and separator for an empty row set', () => {
    table(['Col'], []);

    const lines = logSpy.mock.calls.map((call) => call[0] as string);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Col');
    expect(lines[1]).toBe('---');
  });
});
