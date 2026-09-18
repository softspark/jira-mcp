// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Workspace invariant: nothing a tool call can reach raises a bare `Error`.
 *
 * `failure()` takes the `code` from a `JiraMcpError` and answers
 * `UNKNOWN_ERROR` for anything else. A bare `new Error(...)` in a handler
 * therefore looks fine in review, reads fine in the message, and still tells
 * the MCP client "something broke" when the truth is "fix your arguments".
 * That shipped for every input check in both servers until 1.16.1.
 *
 * The check is on the source text because the alternative is a test per
 * throw site, which is exactly the list that goes stale.
 *
 * `src/cli/` is exempt: a CLI error goes to a terminal, where the message is
 * the whole interface and nobody matches on a code.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const PACKAGES_DIR = fileURLToPath(new URL('../../', import.meta.url));
const BARE_ERROR = /\bnew Error\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function isCli(path: string): boolean {
  const parts = relative(PACKAGES_DIR, path).split(sep);
  return parts.includes('cli') || parts.at(-1) === 'cli.ts';
}

describe('errors a tool call can raise', () => {
  const files = ['core', 'jira-mcp', 'confluence-mcp']
    .flatMap((pkg) => sourceFiles(join(PACKAGES_DIR, pkg, 'src')))
    .filter((path) => !isCli(path));

  it('are typed, so the response carries a real code', () => {
    const offenders = files.flatMap((path) =>
      readFileSync(path, 'utf-8')
        .split('\n')
        .flatMap((line, index) =>
          BARE_ERROR.test(line)
            ? [`${relative(PACKAGES_DIR, path)}:${String(index + 1)}`]
            : [],
        ),
    );

    expect(offenders).toEqual([]);
  });

  it('live in files a text search can read', () => {
    // One raw NUL inside a string literal made git and grep treat
    // tempo-operations.ts as binary. The first version of the check above was
    // a grep, and it reported that file clean while it held six bare errors.
    const binary = files.filter((path) =>
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000e-\u001f\u007f]/.test(readFileSync(path, 'utf-8')),
    );

    expect(binary.map((path) => relative(PACKAGES_DIR, path))).toEqual([]);
  });

  it('walks a real tree, so an empty walk cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(60);
  });
});
