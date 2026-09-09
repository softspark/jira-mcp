// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Workspace invariant: every `files` entry must match something real.
 *
 * npm resolves `files` inside the package directory and drops a pattern that
 * matches nothing without a word. Both packages listed `CHANGELOG.md` while the
 * changelog lived only at the repository root, so every release from 1.12.0
 * shipped without it and the README version badge pointed at a file the tarball
 * did not contain. Nothing failed, because nothing was checking.
 *
 * The changelog is now copied into each package by scripts/sync-changelog.mjs,
 * which runs from `prebuild` and `pretest`, keeping one source of truth at the
 * root. That copy can go stale on its own, so the second test compares it
 * against the root file: a release built from a stale copy would ship the wrong
 * history.
 *
 * Like tool-name-collisions, this reaches across package directories on
 * purpose. It asserts a property of how the workspace publishes, which neither
 * package can see alone.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The published packages, by directory name under packages/. */
const PUBLISHED = ['jira-mcp', 'confluence-mcp'] as const;

function packageDir(name: string): string {
  return join(WORKSPACE_ROOT, 'packages', name);
}

function filesField(name: string): readonly string[] {
  const raw = readFileSync(join(packageDir(name), 'package.json'), 'utf-8');
  return (JSON.parse(raw) as { files?: string[] }).files ?? [];
}

/**
 * Does this `files` pattern match at least one file in the package?
 *
 * Only the shapes the two packages actually use are handled: a literal path,
 * `dir/*.ext`, and `dir/**\/*.ext`. An unrecognised shape returns false rather
 * than passing silently, so a new pattern style has to be taught to this test
 * instead of slipping past it.
 */
function matchesSomething(pkg: string, pattern: string): boolean {
  const root = packageDir(pkg);

  if (!pattern.includes('*')) {
    return existsSync(join(root, pattern));
  }

  const recursive = pattern.includes('**');
  const [dirPart = '', filePart = ''] = [
    pattern.slice(0, pattern.indexOf('*')).replace(/\/$/, '').replace(/\*+$/, ''),
    pattern.slice(pattern.lastIndexOf('/') + 1),
  ];
  const base = join(root, dirPart.replace(/\/\*\*$/, ''));
  if (!existsSync(base)) return false;

  const suffix = filePart.startsWith('*') ? filePart.slice(1) : filePart;

  const walk = (dir: string): boolean =>
    readdirSync(dir).some((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        return recursive ? walk(full) : false;
      }
      return entry.endsWith(suffix);
    });

  return walk(base);
}

describe.each(PUBLISHED)('%s package', (pkg) => {
  it('declares a non-empty files list', () => {
    expect(filesField(pkg).length).toBeGreaterThan(0);
  });

  it.each(filesField(pkg))('ships something for the "%s" entry', (pattern) => {
    // A pattern matching nothing is dropped by npm without an error, so the
    // package quietly ships less than its own manifest claims.
    expect(matchesSomething(pkg, pattern)).toBe(true);
  });

  it('carries a changelog identical to the root one', () => {
    const root = readFileSync(join(WORKSPACE_ROOT, 'CHANGELOG.md'), 'utf-8');
    const copied = readFileSync(join(packageDir(pkg), 'CHANGELOG.md'), 'utf-8');

    // Written by scripts/sync-changelog.mjs. Drift means neither the build nor
    // the test hook ran after the changelog was edited, and a release from this
    // tree would ship stale history.
    expect(copied).toBe(root);
  });
});
