/**
 * Helpers for loading merged template registries from system and user files.
 */

import {
  GLOBAL_COMMENT_TEMPLATES_DIR,
  GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR,
} from '../config/paths.js';
import { loadCommentTemplatesFromDirectorySync, loadTaskTemplatesFromDirectorySync } from './file-loaders.js';
import { TemplateRegistry } from './registry.js';
import { TaskTemplateRegistry } from './task-registry.js';

export interface TemplateCatalog {
  readonly commentRegistry: TemplateRegistry;
  readonly taskRegistry: TaskTemplateRegistry;
}

export interface LoadTemplateCatalogOptions {
  readonly commentTemplatesDir?: string;
  readonly taskTemplatesDir?: string;
}

export function loadTemplateCatalog(
  options?: LoadTemplateCatalogOptions,
): TemplateCatalog {
  const customComments = loadCommentTemplatesFromDirectorySync(
    options?.commentTemplatesDir ?? GLOBAL_COMMENT_TEMPLATES_DIR,
    'user',
  );
  const customTasks = loadTaskTemplatesFromDirectorySync(
    options?.taskTemplatesDir ?? GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR,
    'user',
  );

  return {
    commentRegistry: new TemplateRegistry(customComments),
    taskRegistry: new TaskTemplateRegistry(customTasks),
  };
}
