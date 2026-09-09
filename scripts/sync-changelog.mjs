#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Copy the root changelog into each published package.
 *
 * npm resolves `files` patterns inside the package directory, and the changelog
 * lives at the repository root because it covers both packages. A pattern that
 * matches nothing is dropped without a warning, so every release from 1.12.0
 * shipped without the changelog its own manifest listed. A symlink does not fix
 * it either: `npm pack` skips symlinks.
 *
 * Invoked from the `build`, `test` and `test:coverage` scripts as an explicit
 * command, not as a `prebuild` or `pretest` hook: `.npmrc` sets
 * `ignore-scripts=true` for supply-chain reasons, which disables every npm
 * lifecycle hook in this repository, silently. A hook here would look correct
 * and never run.
 *
 * Build alone would be enough for a correct tarball, but the pre-commit gate
 * runs tests before the build, so a changelog edit would fail packaging.test.ts
 * once and then pass, looking like a flake.
 */

import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLISHED = ['jira-mcp', 'confluence-mcp'];

for (const pkg of PUBLISHED) {
  copyFileSync(
    join(ROOT, 'CHANGELOG.md'),
    join(ROOT, 'packages', pkg, 'CHANGELOG.md'),
  );
}
