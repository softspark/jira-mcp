/**
 * Template rendering engine for comment templates.
 *
 * Supports two constructs:
 *  - {{variable}}              -- direct replacement
 *  - {{#variable}}...{{/variable}} -- conditional block (rendered only if variable is non-empty)
 */

import type { CommentTemplate, TemplateRenderOutput } from './types.js';

/** Matches conditional blocks: {{#var}}content{{/var}} */
const CONDITIONAL_RE = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/** Matches variable placeholders: {{var}} */
const VARIABLE_RE = /\{\{(\w+)\}\}/g;

/**
 * Build a lookup map of default values from template variable definitions.
 */
function buildDefaultsMap(
  template: CommentTemplate,
): ReadonlyMap<string, string> {
  const defaults = new Map<string, string>();
  for (const v of template.variables) {
    if (v.defaultValue !== undefined) {
      defaults.set(v.name, v.defaultValue);
    }
  }
  return defaults;
}

/**
 * Identify required template variables that are missing from the input.
 */
function findMissingRequired(
  template: CommentTemplate,
  variables: Readonly<Record<string, string>>,
): readonly string[] {
  const missing: string[] = [];
  for (const v of template.variables) {
    if (v.required && !(v.name in variables)) {
      missing.push(v.name);
    }
  }
  return missing;
}

/**
 * Collapse runs of three or more consecutive newlines down to two.
 */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/**
 * Render a template with the given variables.
 *
 * Returns rendered markdown on success, or an error with the list of
 * missing required variables on failure.
 */
export function renderTemplate(
  template: CommentTemplate,
  variables: Readonly<Record<string, string>>,
): TemplateRenderOutput {
  // 1. Validate required variables are present
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

  // 2. Process conditional blocks
  result = result.replace(
    CONDITIONAL_RE,
    (_match: string, name: string, content: string): string => {
      const value = variables[name];
      if (value !== undefined && value !== '') {
        return content;
      }
      return '';
    },
  );

  // 3. Replace variable placeholders
  result = result.replace(VARIABLE_RE, (_match: string, name: string): string => {
    if (name in variables) {
      return variables[name] ?? '';
    }
    const fallback = defaults.get(name);
    if (fallback !== undefined) {
      return fallback;
    }
    return '';
  });

  // 4. Clean up blank lines left by removed conditional blocks
  result = collapseBlankLines(result).trim();

  return {
    success: true,
    markdown: result,
  };
}
