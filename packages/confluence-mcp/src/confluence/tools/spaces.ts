// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers: list_spaces, get_space_language
 *
 * @module
 */

import type { ConfluenceDeps, ToolResult } from './helpers.js';
import {
  failure,
  formatForSpace,
  getPageOperations,
  languageForSpace,
  success,
} from './helpers.js';

// ---------------------------------------------------------------------------
// list_spaces
// ---------------------------------------------------------------------------

export interface ListSpacesArgs {
  readonly space_key?: string;
  readonly limit?: number;
}

/**
 * List Confluence spaces.
 *
 * Reports both what the site exposes and which keys are configured locally,
 * because only configured keys can be used to route a write.
 */
export async function handleListSpaces(
  args: ListSpacesArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [, ops] = getPageOperations(deps, args.space_key);
    const spaces = await ops.listSpaces(args.limit);

    return success({
      spaces,
      configured_spaces: deps.pool.getSpaceKeys().map((key) => ({
        key,
        language: languageForSpace(deps.config, key),
        body_format: formatForSpace(deps.config, key),
      })),
      default_space: deps.config.default_space ?? null,
      message: `Found ${String(spaces.length)} space(s)`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// get_space_language
// ---------------------------------------------------------------------------

export interface GetSpaceLanguageArgs {
  readonly space_key?: string;
}

/**
 * Report the language configured for a space.
 *
 * Call this before writing a page, a description or a comment, so content
 * lands in the language the space actually uses.
 */
export function handleGetSpaceLanguage(
  args: GetSpaceLanguageArgs,
  deps: ConfluenceDeps,
): ToolResult {
  try {
    const spaceKey = deps.pool.resolveSpaceKey(args.space_key);
    const language = languageForSpace(deps.config, spaceKey);
    const format = formatForSpace(deps.config, spaceKey);

    const formatNote =
      format === 'storage'
        ? `Pages here are Confluence XHTML: send bodies as 'storage', not 'content'.`
        : `Pages here are markdown: send bodies as 'content'.`;

    return success({
      space_key: spaceKey,
      language,
      body_format: format,
      message: `Write all content for ${spaceKey} in '${language}'. ${formatNote}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
