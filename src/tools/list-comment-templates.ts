/**
 * Tool handler: list_comment_templates
 *
 * Lists all available comment templates, optionally filtered by category.
 * Returns template metadata (id, name, description, category, variables)
 * without the full template body.
 *
 * @module
 */

import type { TemplateRegistry } from '../templates/registry.js';
import type { TemplateCategory } from '../templates/types.js';
import { TEMPLATE_CATEGORIES } from '../templates/types.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

export interface ListCommentTemplatesArgs {
  readonly category?: string;
}

export interface ListCommentTemplatesDeps {
  readonly templateRegistry: TemplateRegistry;
}

/**
 * Validate that a string is a valid {@link TemplateCategory}.
 */
function isValidCategory(value: string): value is TemplateCategory {
  return Object.values(TEMPLATE_CATEGORIES).includes(
    value as TemplateCategory,
  );
}

/**
 * List all registered comment templates with optional category filter.
 */
export async function handleListCommentTemplates(
  args: ListCommentTemplatesArgs,
  deps: ListCommentTemplatesDeps,
): Promise<ToolResult> {
  try {
    let categoryFilter: TemplateCategory | undefined;

    if (args.category) {
      if (!isValidCategory(args.category)) {
        const valid = Object.values(TEMPLATE_CATEGORIES).join(', ');
        return failure(
          new Error(
            `Invalid category '${args.category}'. Valid categories: ${valid}`,
          ),
        );
      }
      categoryFilter = args.category;
    }

    const templates = deps.templateRegistry.listTemplates(categoryFilter);
    const categories = deps.templateRegistry.listCategories();

    return success({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        source: t.source ?? 'system',
        file_path: t.filePath,
        variables: t.variables.map((v) => ({
          name: v.name,
          description: v.description,
          required: v.required,
          example: v.example,
        })),
      })),
      categories,
      count: templates.length,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
