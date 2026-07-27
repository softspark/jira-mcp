// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// Licence banner for the shipped bundles.
//
// The SPDX headers in src/ do not reach consumers: `minify: true` strips every
// comment, and npm ships dist/, not src/. esbuild prepends `banner` verbatim
// after minification, so this is the only attribution that survives into the
// published artifact. Removing it makes the package the one thing in the
// distribution that carries no licence marker at all.
const LICENSE_BANNER =
  '/*! jira-mcp | Apache-2.0 | Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu) | https://github.com/softspark/jira-mcp */';

// Bundle all npm deps EXCEPT commander (CJS, can't be bundled to ESM cleanly)
// commander stays as the sole runtime dependency (240KB, zero transitive deps)
const bundledPackages = [
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

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    platform: 'node',
    noExternal: bundledPackages,
    splitting: false,
    treeshake: true,
    minify: true,
    define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
    banner: {
      js: LICENSE_BANNER,
    },
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    clean: false,
    target: 'node18',
    platform: 'node',
    noExternal: bundledPackages,
    splitting: false,
    treeshake: true,
    minify: true,
    define: { __PKG_VERSION__: JSON.stringify(pkg.version) },
    banner: {
      // The shebang must stay on line 1, so the licence follows it.
      js: `#!/usr/bin/env node\n${LICENSE_BANNER}`,
    },
  },
]);
