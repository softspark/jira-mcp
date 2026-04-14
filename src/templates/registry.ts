/**
 * Template registry that manages built-in and custom comment templates.
 *
 * Custom templates supplied at construction time override built-in templates
 * with the same id, allowing users to customise default behaviour.
 */

import type { CommentTemplate, TemplateCategory } from './types.js';
import { BUILT_IN_TEMPLATES } from './built-in.js';
import { TemplateNotFoundError } from '../errors/index.js';

export class TemplateRegistry {
  private readonly templates: ReadonlyMap<string, CommentTemplate>;

  constructor(customTemplates?: readonly CommentTemplate[]) {
    const map = new Map<string, CommentTemplate>();

    // Built-in templates first
    for (const t of BUILT_IN_TEMPLATES) {
      map.set(t.id, t);
    }

    // Custom templates override built-ins with the same id
    if (customTemplates) {
      for (const t of customTemplates) {
        map.set(t.id, t);
      }
    }

    this.templates = map;
  }

  /**
   * Retrieve a template by its unique identifier.
   *
   * @throws {TemplateNotFoundError} if no template matches the id.
   */
  getTemplate(id: string): CommentTemplate {
    const t = this.templates.get(id);
    if (!t) {
      throw new TemplateNotFoundError(
        `Template "${id}" not found. Use listTemplates() to see available templates.`,
      );
    }
    return t;
  }

  /**
   * List all registered templates, optionally filtered by category.
   */
  listTemplates(category?: TemplateCategory): readonly CommentTemplate[] {
    const all = [...this.templates.values()];
    if (category) {
      return all.filter((t) => t.category === category);
    }
    return all;
  }

  /**
   * Return the distinct set of categories present in the registry.
   */
  listCategories(): readonly TemplateCategory[] {
    const categories = new Set<TemplateCategory>();
    for (const t of this.templates.values()) {
      categories.add(t.category);
    }
    return [...categories];
  }
}
