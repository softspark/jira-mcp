import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

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
      js: '#!/usr/bin/env node',
    },
  },
]);
