// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { Command } from 'commander';
import { z } from 'zod';

import { GLOBAL_CONFIG_DIR, PACKAGE_ROOT_DIR } from '../../config/paths.js';

interface AuditFinding {
  readonly ruleId: string;
  readonly path: string;
  readonly level: 'warning' | 'error';
}

interface AuditEntry {
  readonly path: string;
  readonly mode: string;
  readonly uid: number;
  readonly type: 'directory' | 'file' | 'symlink' | 'other';
}

interface AuditReport {
  readonly schemaVersion: number;
  readonly tool: string;
  readonly scope: string;
  readonly networkAccessed: boolean;
  readonly hook: {
    readonly owner: string;
    readonly runner: string;
    readonly valid: boolean;
    readonly installation: string;
    readonly permissions: readonly string[];
  };
  readonly entries: readonly AuditEntry[];
  readonly findings: readonly AuditFinding[];
}

const HookManifestSchema = z.object({
  hooks: z.object({
    PreToolUse: z.array(z.object({
      matcher: z.string(),
      hooks: z.array(z.object({ type: z.literal('command'), command: z.string() }).strict()),
    }).strict()),
  }).strict(),
}).strict();

const MAX_HOOK_MANIFEST_BYTES = 64 * 1024;

async function inspectPath(
  root: string,
  name: string,
  result: { entries: AuditEntry[]; findings: AuditFinding[] },
): Promise<void> {
  if (name.split('/').length > 8 || result.entries.length >= 1000) {
    result.findings.push({ ruleId: 'inspection-limit', path: name, level: 'warning' });
    return;
  }
  try {
    const info = await lstat(join(root, name));
    const type = info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other';
    result.entries.push({ path: name, mode: (info.mode & 0o777).toString(8).padStart(3, '0'), uid: info.uid, type });
    const wrongDirectory = ['.', 'cache'].includes(name) && type !== 'directory';
    const wrongFile = ['config.json', 'credentials.json', 'state.json'].includes(name) && type !== 'file';
    if (type === 'symlink' || type === 'other' || wrongDirectory || wrongFile) {
      result.findings.push({ ruleId: 'unsafe-file-type', path: name, level: 'error' });
      return;
    }
    if (process.getuid && info.uid !== process.getuid()) {
      result.findings.push({ ruleId: 'unexpected-owner', path: name, level: 'warning' });
    }
    const privatePath = name === 'credentials.json' || name === 'state.json' || name === 'cache' || name.startsWith('cache/');
    const forbidden = privatePath ? (type === 'directory' ? 0o077 : 0o177) : 0o022;
    if ((info.mode & forbidden) !== 0) {
      result.findings.push({ ruleId: 'unsafe-permissions', path: name, level: 'warning' });
    }
    if (type === 'directory' && (name === 'cache' || name.startsWith('cache/'))) {
      for (const child of await readdir(join(root, name))) {
        // Keep report names portable; native separators belong only in filesystem calls.
        await inspectPath(root, `${name}/${child}`, result);
        if (result.entries.length >= 1000) {
          result.findings.push({ ruleId: 'inspection-limit', path: name, level: 'warning' });
          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    result.findings.push({ ruleId: 'unreadable-path', path: name, level: 'error' });
  }
}

async function readHookManifest(path: string): Promise<unknown> {
  const before = await lstat(path);
  if (!before.isFile() || before.size > MAX_HOOK_MANIFEST_BYTES) throw new Error('Invalid hook file');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size > MAX_HOOK_MANIFEST_BYTES) throw new Error('Changed hook file');
    const buffer = Buffer.alloc(MAX_HOOK_MANIFEST_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > MAX_HOOK_MANIFEST_BYTES) throw new Error('Oversized hook file');
    return JSON.parse(buffer.subarray(0, used).toString('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

async function inspectHook(packageRoot: string, findings: AuditFinding[]): Promise<boolean> {
  const manifestPath = 'hooks/jira-mcp-hooks.json';
  try {
    if (!(await lstat(join(packageRoot, 'hooks'))).isDirectory()) throw new Error('Invalid hooks directory');
    const manifest = HookManifestSchema.parse(await readHookManifest(join(packageRoot, manifestPath)));
    const entries = manifest.hooks.PreToolUse;
    const valid = entries.length === 1 && entries[0]?.matcher === 'mcp__.*__add_task_comment|mcp__.*__add_templated_comment'
      && entries[0].hooks.length === 1 && entries[0].hooks[0]?.command === 'jira-mcp hook comment-approval';
    if (valid) return true;
  } catch { /* Report only the path; malformed content may contain secrets. */ }
  findings.push({ ruleId: 'invalid-hook-manifest', path: manifestPath, level: 'error' });
  return false;
}

export async function collectAudit(configRoot = GLOBAL_CONFIG_DIR, packageRoot = PACKAGE_ROOT_DIR): Promise<AuditReport> {
  const result: { entries: AuditEntry[]; findings: AuditFinding[] } = { entries: [], findings: [] };
  await inspectPath(configRoot, '.', result);
  if (result.entries[0]?.type === 'directory') {
    for (const name of ['config.json', 'credentials.json', 'state.json', 'cache']) {
      await inspectPath(configRoot, name, result);
    }
  }
  const hookValid = await inspectHook(packageRoot, result.findings);
  return {
    schemaVersion: 1,
    tool: 'jira-mcp',
    scope: 'local-filesystem-and-shipped-hook',
    networkAccessed: false,
    hook: {
      owner: '@softspark/jira-mcp',
      runner: 'jira-mcp hook comment-approval',
      valid: hookValid,
      installation: 'not-inspected',
      permissions: ['read:stdin', 'read:comment-templates', 'write:stderr', 'set:exit-code'],
    },
    ...result,
  };
}

export function registerAuditCommand(program: Command): void {
  program.command('audit')
    .description('Inspect local file permissions and shipped hook ownership without contacting Jira')
    .option('--json', 'Emit a machine-readable report')
    .option('--sarif', 'Emit SARIF 2.1.0 for code scanning')
    .action(async (options: { readonly json?: boolean; readonly sarif?: boolean }) => {
      const report = await collectAudit();
      if (options.sarif) {
        console.log(JSON.stringify({ version: '2.1.0', runs: [{
          tool: { driver: { name: 'jira-mcp' } },
          results: report.findings.map(finding => ({
            ruleId: finding.ruleId, level: finding.level, message: { text: finding.ruleId },
            locations: [{ physicalLocation: { artifactLocation: { uri: pathToFileURL(join(
              finding.ruleId === 'invalid-hook-manifest' ? PACKAGE_ROOT_DIR : GLOBAL_CONFIG_DIR, finding.path,
            )).href } } }],
          })),
        }] }, null, 2));
      } else if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Jira MCP audit: ${report.entries.length} local paths; shipped hook ${report.hook.valid ? 'valid' : 'invalid'}`);
        for (const finding of report.findings) console.log(`${finding.level}: ${finding.ruleId} (${finding.path})`);
        console.log('Credential contents, Jira APIs and client hook installation were not inspected.');
      }
      process.exitCode = report.findings.length === 0 ? 0 : 1;
    });
}
