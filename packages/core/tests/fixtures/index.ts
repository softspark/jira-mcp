// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Test fixtures shared across the workspace.
 *
 * Config and ADF shapes belong to core, and both server packages build test
 * data from them. Exposing them through the package's `./test-fixtures`
 * export keeps the other packages from reaching across directory boundaries
 * with `../../../core/tests/...` paths.
 *
 * Never imported by `src/`, so nothing here reaches a published bundle.
 *
 * @module
 */

export * from './adf.js';
export * from './config.js';
