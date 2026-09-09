// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// See the jira-mcp tsup config for why this banner is the only attribution
// that survives minification into the published artifact.
const LICENSE_BANNER =
  '/*! confluence-mcp | Apache-2.0 | Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu) | https://github.com/softspark/jira-mcp */';

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
