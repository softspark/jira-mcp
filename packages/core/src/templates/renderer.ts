// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Template rendering, shared by every template kind in the workspace.
 *
 * Two constructs, and nothing else:
 *  - `{{variable}}`                    -- direct replacement
 *  - `{{#variable}}...{{/variable}}`   -- block kept only when the variable
 *                                         is present and non-empty
 *
 * The body is opaque text. Jira comment and task templates are markdown;
 * Confluence page templates are markdown or storage XHTML. None of that
 * matters here, which is why this lives in core rather than in one product.
 *
 * @module
 */

/** Matches conditional blocks: {{#var}}content{{/var}} */
const CONDITIONAL_RE = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/** Matches variable placeholders: {{var}} */
const VARIABLE_RE = /\{\{(\w+)\}\}/g;

/** One declared input of a template. */
export interface TemplateVariable {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: string;
  readonly example?: string;
}

/**
 * The minimum a template must provide to be rendered.
 *
 * Structural on purpose: comment, task and page templates all satisfy it
 * without sharing a base class or knowing about each other.
 */
export interface RenderableTemplate {
  readonly variables: readonly TemplateVariable[];
  readonly body: string;
}

export interface RenderResult {
  readonly success: true;
  readonly markdown: string;
  readonly usedVariables: readonly string[];
}

export interface RenderError {
  readonly success: false;
  readonly error: string;
  readonly missingVariables: readonly string[];
}

export type TemplateRenderOutput = RenderResult | RenderError;

/** Build a lookup of default values from the declared variables. */
function buildDefaultsMap(
  template: RenderableTemplate,
): ReadonlyMap<string, string> {
  const defaults = new Map<string, string>();
  for (const v of template.variables) {
    if (v.defaultValue !== undefined) {
      defaults.set(v.name, v.defaultValue);
    }
  }
  return defaults;
}

/** Required variables the caller did not supply and that have no default. */
function findMissingRequired(
  template: RenderableTemplate,
  variables: Readonly<Record<string, string>>,
): string[] {
  return template.variables
    .filter(
      (v) =>
        v.required &&
        v.defaultValue === undefined &&
        (variables[v.name] === undefined || variables[v.name] === ''),
    )
    .map((v) => v.name);
}

/** Collapse the blank runs a removed conditional block leaves behind. */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/**
 * Render a template with the given variables.
 *
 * Returns the rendered body on success, or the list of missing required
 * variables on failure. Never throws: a caller turns the failure into a tool
 * error with the names the user still has to supply.
 */
export function renderTemplate(
  template: RenderableTemplate,
  variables: Readonly<Record<string, string>>,
): TemplateRenderOutput {
  const missing = findMissingRequired(template, variables);
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required variables: ${missing.join(', ')}`,
      missingVariables: missing,
    };
  }

  const defaults = buildDefaultsMap(template);
  let result = template.body;

  result = result.replace(
    CONDITIONAL_RE,
    (_match: string, name: string, content: string): string => {
      const value = variables[name];
      return value !== undefined && value !== '' ? content : '';
    },
  );

  result = result.replace(VARIABLE_RE, (_match: string, name: string): string => {
    if (name in variables) {
      return variables[name] ?? '';
    }
    return defaults.get(name) ?? '';
  });

  return {
    success: true,
    markdown: collapseBlankLines(result).trim(),
    usedVariables: Object.keys(variables),
  };
}
