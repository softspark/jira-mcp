/**
 * Comment template system barrel export.
 *
 * Provides structured comment templates with variable interpolation
 * and conditional blocks for Jira issue comments.
 */

export { BUILT_IN_TEMPLATES } from './built-in.js';
export { BUILT_IN_TASK_TEMPLATES } from './task-built-in.js';
export { renderTemplate } from './renderer.js';
export { TemplateRegistry } from './registry.js';
export { TaskTemplateRegistry } from './task-registry.js';
export { loadTemplateCatalog } from './catalog.js';
export {
  TEMPLATE_CATEGORIES,
  TEMPLATE_SOURCES,
  type CommentTemplate,
  type RenderError,
  type RenderResult,
  type TemplateCategory,
  type TemplateRenderOutput,
  type TemplateSource,
  type TemplateVariable,
} from './types.js';
export type { TaskTemplate } from './task-types.js';
