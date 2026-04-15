/**
 * Tool handler: list_task_templates
 *
 * Lists all available single-task templates used by create_task.
 */

import type { TaskTemplateRegistry } from '../templates/task-registry.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

export interface ListTaskTemplatesDeps {
  readonly taskTemplateRegistry: TaskTemplateRegistry;
}

export async function handleListTaskTemplates(
  _args: Record<string, never>,
  deps: ListTaskTemplatesDeps,
): Promise<ToolResult> {
  try {
    const templates = deps.taskTemplateRegistry.listTemplates();

    return success({
      templates: templates.map((template) => ({
        id: template.id,
        name: template.name,
        description: template.description,
        summary: template.summary,
        issue_type: template.issueType ?? 'Task',
        priority: template.priority ?? 'Medium',
        labels: template.labels ?? [],
        source: template.source ?? 'system',
        file_path: template.filePath,
        variables: template.variables.map((variable) => ({
          name: variable.name,
          description: variable.description,
          required: variable.required,
          example: variable.example,
        })),
      })),
      count: templates.length,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
