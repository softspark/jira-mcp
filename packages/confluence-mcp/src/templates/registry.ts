// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Page template registry.
 *
 * Loads templates from the package's `templates-system/pages/` directory and
 * from `~/.softspark/jira-mcp/templates/pages/`, with the user directory
 * overriding a shipped template of the same id.
 *
 * Files are markdown with a leading JSON block between `---` fences, matching
 * the Jira comment and task template format so there is one thing to learn.
 *
 * @module
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  TemplateNotFoundError,
  renderTemplate,
  type BodyFormat,
  type TemplateVariable,
} from '@softspark/atlassian-mcp-core';

import type { PageTemplate, PageTemplateSource, RenderedPage } from './types.js';

/** Metadata block shape, as written in a template file's JSON header. */
interface RawTemplateMeta {
  readonly id?: string;
  readonly name?: string;
  readonly description?: string;
  readonly format?: string;
  readonly title?: string;
  readonly labels?: readonly string[];
  readonly variables?: readonly {
    readonly name?: string;
    readonly description?: string;
    readonly required?: boolean;
    readonly default?: string;
    readonly example?: string;
  }[];
}

/** Split a template file into its JSON header and its body. */
function splitFrontmatter(
  raw: string,
): { readonly meta: string; readonly body: string } | undefined {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(raw);
  if (!match?.[1] || match[2] === undefined) {
    return undefined;
  }
  return { meta: match[1], body: match[2] };
}

function toVariables(raw: RawTemplateMeta): readonly TemplateVariable[] {
  return (raw.variables ?? []).map((v) => ({
    name: v.name ?? '',
    description: v.description ?? '',
    required: v.required ?? false,
    ...(v.default !== undefined ? { defaultValue: v.default } : {}),
    ...(v.example !== undefined ? { example: v.example } : {}),
  }));
}

/**
 * Parse one template file.
 *
 * Returns `undefined` for anything malformed rather than throwing: one bad
 * file in a user directory must not stop the server from starting, and the
 * template simply does not appear in the listing.
 */
export function parsePageTemplate(
  raw: string,
  filePath: string,
  source: PageTemplateSource,
): PageTemplate | undefined {
  const split = splitFrontmatter(raw);
  if (!split) {
    return undefined;
  }

  let meta: RawTemplateMeta;
  try {
    meta = JSON.parse(split.meta) as RawTemplateMeta;
  } catch {
    return undefined;
  }

  if (!meta.id || !meta.title) {
    return undefined;
  }

  const format: BodyFormat = meta.format === 'storage' ? 'storage' : 'markdown';

  return {
    id: meta.id,
    name: meta.name ?? meta.id,
    description: meta.description ?? '',
    format,
    title: meta.title,
    body: split.body.trim(),
    variables: toVariables(meta),
    ...(meta.labels !== undefined ? { labels: meta.labels } : {}),
    source,
    filePath,
  };
}

function loadDirectory(
  dir: string,
  source: PageTemplateSource,
): PageTemplate[] {
  if (!existsSync(dir)) {
    return [];
  }

  const templates: PageTemplate[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    const full = join(dir, entry);
    try {
      const parsed = parsePageTemplate(readFileSync(full, 'utf-8'), full, source);
      if (parsed) {
        templates.push(parsed);
      }
    } catch {
      // Unreadable file: skip it, same reasoning as a malformed one.
    }
  }
  return templates;
}

export class PageTemplateRegistry {
  private readonly byId = new Map<string, PageTemplate>();

  constructor(templates: readonly PageTemplate[]) {
    for (const t of templates) {
      this.byId.set(t.id, t);
    }
  }

  /**
   * Build a registry from the shipped and user template directories.
   *
   * User templates are loaded second so an id present in both resolves to the
   * user's copy.
   */
  static load(systemDir: string, userDir: string): PageTemplateRegistry {
    return new PageTemplateRegistry([
      ...loadDirectory(systemDir, 'system'),
      ...loadDirectory(userDir, 'user'),
    ]);
  }

  listTemplates(format?: BodyFormat): readonly PageTemplate[] {
    const all = [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    return format === undefined ? all : all.filter((t) => t.format === format);
  }

  /** @throws {TemplateNotFoundError} If no template carries that id. */
  getTemplate(id: string): PageTemplate {
    const template = this.byId.get(id);
    if (!template) {
      throw new TemplateNotFoundError(
        `Page template '${id}' not found. Available: ${[...this.byId.keys()].join(', ') || '(none)'}`,
      );
    }
    return template;
  }

  /**
   * Render a template's title and body with the supplied variables.
   *
   * Both go through the same engine, so a variable can appear in either.
   *
   * @throws {Error} If a required variable is missing, naming the ones needed.
   */
  render(
    id: string,
    variables: Readonly<Record<string, string>>,
  ): RenderedPage {
    const template = this.getTemplate(id);

    const title = renderTemplate(
      { variables: template.variables, body: template.title },
      variables,
    );
    if (!title.success) {
      throw new Error(title.error);
    }

    const body = renderTemplate(
      { variables: template.variables, body: template.body },
      variables,
    );
    if (!body.success) {
      throw new Error(body.error);
    }

    return {
      title: title.markdown,
      body: body.markdown,
      format: template.format,
      labels: template.labels ?? [],
    };
  }
}
