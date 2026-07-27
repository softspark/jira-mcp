// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Package version injected at build time by tsup (define: __PKG_VERSION__).
 * Single source of truth: package.json "version" field.
 *
 * @module
 */

declare const __PKG_VERSION__: string;

export const VERSION: string = __PKG_VERSION__;
