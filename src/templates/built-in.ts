// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Built-in comment templates shipped with the Jira MCP server.
 *
 * These templates are stored as physical markdown files under
 * templates-system/comments/ and loaded at module initialization.
 */

import { SYSTEM_COMMENT_TEMPLATES_DIR } from '../config/paths.js';
import { loadCommentTemplatesFromDirectorySync } from './file-loaders.js';

export const BUILT_IN_TEMPLATES = loadCommentTemplatesFromDirectorySync(
  SYSTEM_COMMENT_TEMPLATES_DIR,
  'system',
);
