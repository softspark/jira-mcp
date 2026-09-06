// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectAudit } from '../../../src/cli/commands/audit.js';
import { createProgram } from '../../../src/cli/index.js';
import type * as ConfigPaths from '../../../src/config/paths.js';
import type * as NodePath from 'node:path';
import { handleInit } from '../../../src/cli/commands/config/init.js';

vi.mock('../../../src/version.js', () => ({ VERSION: '0.0.0-test' }));

let sandbox: string;
beforeEach(async () => { sandbox = await mkdtemp(join(tmpdir(), 'jira-audit-')); });
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock('node:path');
  vi.doUnmock('../../../src/config/paths.js');
  vi.resetModules();
  process.exitCode = 0;
  await rm(sandbox, { recursive: true, force: true });
});

describe('local audit', () => {
  it('initializes a configuration whose credentials, state and cache have safe permissions', async () => {
    const root = join(sandbox, 'new-config');
    await handleInit(root);
    const report = await collectAudit(root);
    expect(report.findings).toEqual([]);
    expect(report.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'cache', mode: '700' }),
      expect.objectContaining({ path: 'state.json', mode: '600' }),
    ]));
  });
  it('detects public credentials and cache files without reading their secrets or using the network', async () => {
    const network = vi.fn(() => { throw new Error('Network forbidden'); });
    vi.stubGlobal('fetch', network);
    await writeFile(join(sandbox, 'credentials.json'), 'secret-token-do-not-output', { mode: 0o644 });
    await chmod(join(sandbox, 'credentials.json'), 0o644);
    await mkdir(join(sandbox, 'cache'), { mode: 0o700 });
    await writeFile(join(sandbox, 'cache/users.json'), 'private-user-data', { mode: 0o644 });
    const report = await collectAudit(sandbox);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'unsafe-permissions', path: 'credentials.json' }),
      expect.objectContaining({ ruleId: 'unsafe-permissions', path: 'cache/users.json' }),
    ]));
    expect(report.hook.valid).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/secret-token|private-user-data/);
    expect(network).not.toHaveBeenCalled();
    expect(await readFile(join(sandbox, 'credentials.json'), 'utf8')).toBe('secret-token-do-not-output');
  });

  it('accepts owner-only credentials and treats an unconfigured install as empty', async () => {
    expect((await collectAudit(join(sandbox, 'missing'))).entries).toEqual([]);
    await writeFile(join(sandbox, 'credentials.json'), 'not-even-json', { mode: 0o600 });
    expect((await collectAudit(sandbox)).findings).toEqual([]);
  });

  it('keeps nested cache traversal, private checks and depth limits independent of native relative separators', async () => {
    vi.resetModules();
    vi.doMock('node:path', async () => {
      const original = await vi.importActual<typeof NodePath>('node:path');
      return { ...original, relative: original.win32.relative };
    });
    const { collectAudit: portableAudit } = await import('../../../src/cli/commands/audit.js');
    await mkdir(join(sandbox, 'cache', 'instance', 'archive'), { recursive: true, mode: 0o700 });
    await writeFile(join(sandbox, 'cache', 'instance', 'archive', 'users.json'), 'private-data', { mode: 0o644 });
    await mkdir(join(sandbox, 'cache', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'), { recursive: true, mode: 0o700 });
    const report = await portableAudit(sandbox);
    expect(report.findings).toContainEqual({ ruleId: 'unsafe-permissions', path: 'cache/instance/archive/users.json', level: 'warning' });
    expect(report.findings).toContainEqual({ ruleId: 'inspection-limit', path: 'cache/a/b/c/d/e/f/g/h', level: 'warning' });
    expect(report.entries.some(entry => entry.path.includes('\\'))).toBe(false);
    expect(JSON.stringify(report)).not.toContain('private-data');
  });

  it('rejects wrong file types and does not follow a symlinked cache or configuration root', async () => {
    const target = join(sandbox, 'target');
    const config = join(sandbox, 'config');
    await mkdir(target);
    await mkdir(config);
    await writeFile(join(target, 'secret-file'), 'never-read');
    await symlink(target, join(config, 'cache'));
    await mkdir(join(config, 'credentials.json'), { mode: 0o700 });
    const report = await collectAudit(config);
    expect(report.findings).toContainEqual({ ruleId: 'unsafe-file-type', path: 'cache', level: 'error' });
    expect(report.findings).toContainEqual({ ruleId: 'unsafe-file-type', path: 'credentials.json', level: 'error' });
    expect(report.entries.some(entry => entry.path.includes('secret-file'))).toBe(false);
    await symlink(target, join(sandbox, 'root-link'));
    expect((await collectAudit(join(sandbox, 'root-link'))).entries).toHaveLength(1);
  });

  it('reports a missing or altered shipped hook without echoing its command', async () => {
    await mkdir(join(sandbox, 'hooks'));
    await writeFile(join(sandbox, 'hooks/jira-mcp-hooks.json'), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'secret-command' }] }] },
    }));
    const report = await collectAudit(join(sandbox, 'missing'), sandbox);
    expect(report.hook.valid).toBe(false);
    expect(report.findings[0]?.ruleId).toBe('invalid-hook-manifest');
    expect(JSON.stringify(report)).not.toContain('secret-command');
    expect((await collectAudit(sandbox, join(sandbox, 'missing'))).hook.valid).toBe(false);
  });

  it('accepts a manifest at the 64 KiB limit and rejects an oversized manifest without exposing content', async () => {
    const { PACKAGE_ROOT_DIR } = await vi.importActual<typeof ConfigPaths>('../../../src/config/paths.js');
    const original = await readFile(join(PACKAGE_ROOT_DIR, 'hooks/jira-mcp-hooks.json'), 'utf8');
    await mkdir(join(sandbox, 'hooks'));
    const manifestPath = join(sandbox, 'hooks/jira-mcp-hooks.json');
    await writeFile(manifestPath, original.padEnd(64 * 1024, ' '));
    expect((await collectAudit(join(sandbox, 'missing'), sandbox)).hook.valid).toBe(true);
    // Still valid JSON and schema: an unbounded read would incorrectly accept it.
    await writeFile(manifestPath, original.padEnd(64 * 1024 + 1, ' '));
    const report = await collectAudit(join(sandbox, 'missing'), sandbox);
    expect(report.hook.valid).toBe(false);
    expect(report.findings[0]?.ruleId).toBe('invalid-hook-manifest');
    expect(JSON.stringify(report)).not.toContain('"PreToolUse"');
  });

  it('rejects symlinked manifests and FIFOs without following or blocking on them', async () => {
    await mkdir(join(sandbox, 'hooks'));
    const manifestPath = join(sandbox, 'hooks/jira-mcp-hooks.json');
    const target = join(sandbox, 'outside-manifest');
    await writeFile(target, 'secret-must-not-leak');
    await symlink(target, manifestPath);
    expect((await collectAudit(join(sandbox, 'missing'), sandbox)).hook.valid).toBe(false);
    await rm(manifestPath);
    execFileSync('mkfifo', [manifestPath], { timeout: 1000 });
    const report = await collectAudit(join(sandbox, 'missing'), sandbox);
    expect(report.hook.valid).toBe(false);
    expect(JSON.stringify(report)).not.toContain('secret-must-not-leak');
  }, 2000);

  it('runs the actual Commander JSON and text actions with a temporary config root', async () => {
    vi.resetModules();
    vi.doMock('../../../src/config/paths.js', async () => {
      const original = await vi.importActual<typeof ConfigPaths>('../../../src/config/paths.js');
      return { ...original, GLOBAL_CONFIG_DIR: sandbox };
    });
    const { createProgram: isolatedProgram } = await import('../../../src/cli/index.js');
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await isolatedProgram().parseAsync(['audit', '--json'], { from: 'user' });
    const report = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(report.hook.valid).toBe(true);
    expect(process.exitCode).toBe(0);
    output.mockClear();
    await writeFile(join(sandbox, 'credentials.json'), 'secret', { mode: 0o644 });
    await isolatedProgram().parseAsync(['audit'], { from: 'user' });
    expect(output.mock.calls.flat().join(' ')).toContain('unsafe-permissions');
    expect(process.exitCode).toBe(1);
    output.mockClear();
    await isolatedProgram().parseAsync(['audit', '--sarif'], { from: 'user' });
    const sarif = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results[0]).toMatchObject({ ruleId: 'unsafe-permissions', level: 'warning' });
    expect(new URL(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).protocol).toBe('file:');
    vi.doUnmock('../../../src/config/paths.js');
  });

  it('exposes audit in the public help', () => {
    expect(createProgram().helpInformation()).toContain('audit [options]');
  });
});
