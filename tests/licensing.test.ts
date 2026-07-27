// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Licensing contract: Apache-2.0 across every surface that declares a licence,
 * an SPDX header on every source file, and attribution that actually reaches
 * the published artifact.
 *
 * The last part is why this file exists. npm ships `dist/`, not `src/`, and the
 * build runs with `minify: true`, which strips every comment. The SPDX headers
 * below are for whoever clones the repository; the only attribution a consumer
 * ever sees comes from the tsup `banner`. Losing that banner would leave the
 * published package as the one artifact in the distribution carrying no licence
 * marker at all, and nothing else in the build would fail.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const SOURCE_EXT = new Set(['.ts', '.mjs']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXT.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const sourceFiles = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'tests')),
  ...['eslint.config.mjs', 'tsup.config.ts', 'vitest.config.ts']
    .map((f) => join(ROOT, f))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    }),
];

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf-8');

describe('licensing', () => {
  it('finds source files to check', () => {
    // Guards the walker itself: an empty list would make every assertion below
    // pass vacuously.
    expect(sourceFiles.length).toBeGreaterThan(100);
  });

  it('every source file carries an SPDX header', () => {
    const missing = sourceFiles.filter((f) => !readFileSync(f, 'utf-8').includes('SPDX-License-Identifier'));
    expect(missing.map((f) => f.replace(`${ROOT}/`, ''))).toEqual([]);
  });

  it('every SPDX header names Apache-2.0', () => {
    const wrong = sourceFiles.filter((f) => {
      const line = readFileSync(f, 'utf-8')
        .split('\n')
        .find((l) => l.includes('SPDX-License-Identifier'));
      return line !== undefined && !line.includes('Apache-2.0');
    });
    expect(wrong.map((f) => f.replace(`${ROOT}/`, ''))).toEqual([]);
  });

  it('LICENSE is the complete Apache 2.0 text', () => {
    const license = read('LICENSE');
    expect(license).toContain('Apache License');
    expect(license).toContain('Version 2.0, January 2004');
    expect(license).toContain('END OF TERMS AND CONDITIONS');
    expect(license).toContain('APPENDIX: How to apply the Apache License');
  });

  it('NOTICE carries attribution, the source URL and section 4(d)', () => {
    const notice = read('NOTICE');
    expect(notice).toContain('Lukasz Krzemien');
    expect(notice).toContain('github.com/softspark/jira-mcp');
    expect(notice).toContain('4(d)');
    // Releases before the change stay MIT; the notice they run under is kept.
    expect(notice).toContain('MIT License');
  });

  it('LICENSE and NOTICE both ship in the npm package', () => {
    const pkg = JSON.parse(read('package.json')) as { files: string[] };
    expect(pkg.files).toContain('LICENSE');
    expect(pkg.files).toContain('NOTICE');
  });

  it('package.json declares Apache-2.0', () => {
    const pkg = JSON.parse(read('package.json')) as { license: string };
    expect(pkg.license).toBe('Apache-2.0');
  });

  it('the build config injects a licence banner into both bundles', () => {
    // The banner is the only attribution that survives minification into dist/.
    const config = read('tsup.config.ts');
    expect(config).toContain('LICENSE_BANNER');
    expect(config).toContain('Apache-2.0');
    // Both entries must carry it, not just the CLI.
    const banners = config.match(/banner:/g) ?? [];
    expect(banners.length).toBe(2);
  });
});
