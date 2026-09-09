// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { copyFileSync, readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// The changelog is shared by both published packages and lives at the repository
// root, but `files` in package.json resolves inside the package directory, so a
// bare "CHANGELOG.md" entry matched nothing and npm skipped it silently. Every
// release from 1.12.0 shipped without the changelog it promised, and the README
// version badge linked to a file that was not in the tarball.
//
// The root file stays the one people edit; this copy is written by the build,
// and packages/core/tests/packaging.test.ts fails if the two ever drift.
copyFileSync('../../CHANGELOG.md', './CHANGELOG.md');

// Licence banner for the shipped bundles.
//
// The SPDX headers in src/ do not reach consumers: `minify: true` strips every
// comment, and npm ships dist/, not src/. esbuild prepends `banner` verbatim
// after minification, so this is the only attribution that survives into the
// published artifact. Removing it makes the package the one thing in the
// distribution that carries no licence marker at all.
const LICENSE_BANNER =
  '/*! jira-mcp | Apache-2.0 | Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu) | https://github.com/softspark/jira-mcp */';

// Bundle all npm deps EXCEPT commander (CJS, can't be bundled to ESM cleanly).
// commander stays as the sole runtime dependency (240KB, zero transitive deps).
//
// @softspark/atlassian-mcp-core is a private workspace package that is never
// published, so it MUST be bundled: a consumer installing this package from
// npm has no way to resolve it otherwise.
const bundledPackages = [
  '@softspark/atlassian-mcp-core',
  '@modelcontextprotocol/sdk',
  'zod',
  'content-type',
  'raw-body',
  'zod-to-json-schema',
  'eventsource',
  'eventsource-parser',
  'pkce-challenge',
  'cross-spawn',
];

const shared = {
  format: ['esm'] as const,
  target: 'node18' as const,
  platform: 'node' as const,
  noExternal: bundledPackages,
  splitting: false,
  treeshake: true,
  minify: true,
  sourcemap: true,
  define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    dts: true,
    clean: true,
    banner: { js: LICENSE_BANNER },
  },
  {
    ...shared,
    entry: { cli: 'src/cli.ts' },
    clean: false,
    banner: {
      // The shebang must stay on line 1, so the licence follows it.
      js: `#!/usr/bin/env node\n${LICENSE_BANNER}`,
    },
  },
]);
