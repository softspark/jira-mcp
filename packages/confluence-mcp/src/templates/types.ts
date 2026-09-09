// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Page template types.
 *
 * A page template carries a title and a body, both rendered with the shared
 * `{{variable}}` engine. The body is markdown or Confluence storage XHTML,
 * declared by `format`, because a template written in one is unusable in a
 * space configured for the other.
 *
 * @module
 */

import type { BodyFormat, TemplateVariable } from '@softspark/atlassian-mcp-core';

/** Where a template came from, for reporting in tool results. */
export type PageTemplateSource = 'system' | 'user';

export interface PageTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Body representation this template is written in. */
  readonly format: BodyFormat;
  readonly variables: readonly TemplateVariable[];
  /** Page title, itself a template so it can carry variables. */
  readonly title: string;
  /** Page body in the declared format. */
  readonly body: string;
  readonly labels?: readonly string[];
  readonly source?: PageTemplateSource;
  readonly filePath?: string;
}

/** Result of rendering a page template into a ready-to-create page. */
export interface RenderedPage {
  readonly title: string;
  readonly body: string;
  readonly format: BodyFormat;
  readonly labels: readonly string[];
}
