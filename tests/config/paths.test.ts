// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { chmod, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NodeOs from 'node:os';

let sandbox: string;
beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'jira-global-paths-'));
  vi.resetModules();
  vi.doMock('node:os', async () => ({
    ...await vi.importActual<typeof NodeOs>('node:os'),
    homedir: () => sandbox,
  }));
});
afterEach(async () => {
  vi.doUnmock('node:os');
  vi.resetModules();
  await rm(sandbox, { recursive: true, force: true });
});

describe('ensureGlobalDirs', () => {
  it('creates the configuration, cache and template directories privately', async () => {
    const paths = await import('../../src/config/paths.js');
    await paths.ensureGlobalDirs();
    for (const path of [paths.GLOBAL_CONFIG_DIR, paths.GLOBAL_CACHE_DIR,
      paths.GLOBAL_COMMENT_TEMPLATES_DIR, paths.GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR,
      paths.GLOBAL_TASK_TEMPLATES_DIR]) {
      expect(path.startsWith(sandbox)).toBe(true);
      expect((await stat(path)).mode & 0o777).toBe(0o700);
    }
  });

  it('preserves existing permissions and creates missing children privately', async () => {
    const paths = await import('../../src/config/paths.js');
    await mkdir(paths.GLOBAL_CACHE_DIR, { recursive: true });
    await chmod(paths.GLOBAL_CONFIG_DIR, 0o750);
    await chmod(paths.GLOBAL_CACHE_DIR, 0o750);
    await paths.ensureGlobalDirs();
    expect((await stat(paths.GLOBAL_CONFIG_DIR)).mode & 0o777).toBe(0o750);
    expect((await stat(paths.GLOBAL_CACHE_DIR)).mode & 0o777).toBe(0o750);
    expect((await stat(paths.GLOBAL_COMMENT_TEMPLATES_DIR)).mode & 0o777).toBe(0o700);
  });
});
