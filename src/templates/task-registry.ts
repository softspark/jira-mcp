/**
 * Registry for single-task templates used by create_task.
 *
 * Custom templates supplied at construction time override built-in templates
 * with the same id.
 */

import { TemplateNotFoundError } from '../errors/index.js';
import { BUILT_IN_TASK_TEMPLATES } from './task-built-in.js';
import type { TaskTemplate } from './task-types.js';

export class TaskTemplateRegistry {
  private readonly templates: ReadonlyMap<string, TaskTemplate>;

  constructor(customTemplates?: readonly TaskTemplate[]) {
    const map = new Map<string, TaskTemplate>();

    for (const template of BUILT_IN_TASK_TEMPLATES) {
      map.set(template.id, template);
    }

    if (customTemplates) {
      for (const template of customTemplates) {
        map.set(template.id, template);
      }
    }

    this.templates = map;
  }

  getTemplate(id: string): TaskTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new TemplateNotFoundError(
        `Task template "${id}" not found. Use listTaskTemplates() to see available templates.`,
      );
    }
    return template;
  }

  listTemplates(): readonly TaskTemplate[] {
    return [...this.templates.values()];
  }
}
