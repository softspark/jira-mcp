// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Tool handler: list_page_templates
 *
 * @module
 */

import type { ConfluenceDeps, ToolResult } from './helpers.js';
import { failure, formatForSpace, success } from './helpers.js';

export interface ListPageTemplatesArgs {
  readonly space_key?: string;
  readonly all_formats?: boolean;
}

/**
 * List page templates available for `create_page`.
 *
 * Filtered to the space's body format by default: a storage template is
 * unusable in a markdown space and the other way round, so offering both
 * would only invite a call that fails.
 */
export function handleListPageTemplates(
  args: ListPageTemplatesArgs,
  deps: ConfluenceDeps,
): ToolResult {
  try {
    const registry = deps.pageTemplates;
    if (!registry) {
      return success({
        templates: [],
        message: 'No page templates are loaded.',
      });
    }

    const spaceKey = deps.pool.resolveSpaceKey(args.space_key);
    const format = formatForSpace(deps.config, spaceKey);
    const templates = registry.listTemplates(
      args.all_formats === true ? undefined : format,
    );

    return success({
      space_key: spaceKey,
      space_format: format,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        format: t.format,
        title_pattern: t.title,
        labels: t.labels ?? [],
        source: t.source ?? 'system',
        variables: t.variables.map((v) => ({
          name: v.name,
          description: v.description,
          required: v.required,
          ...(v.defaultValue !== undefined ? { default: v.defaultValue } : {}),
          ...(v.example !== undefined ? { example: v.example } : {}),
        })),
      })),
      message:
        args.all_formats === true
          ? `Found ${String(templates.length)} page template(s) across both formats`
          : `Found ${String(templates.length)} page template(s) usable in ${spaceKey} (format ${format})`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
