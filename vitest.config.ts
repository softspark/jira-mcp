// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

import { defineConfig } from 'vitest/config';

/**
 * One test run across the whole workspace.
 *
 * The three packages are tested together on purpose: `core` has no consumers
 * of its own, and a change there is only meaningful if both servers still
 * pass. A per-package run would let a core change break a server without any
 * single command noticing.
 */
export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        // Entry points: a shebang and a call into the program builder.
        'packages/*/src/index.ts',
        'packages/*/src/cli.ts',
        // Version is replaced by the bundler at build time.
        'packages/*/src/version.ts',
      ],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
      },
    },
  },
});
