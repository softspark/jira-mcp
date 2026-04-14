/**
 * Comment template system barrel export.
 *
 * Provides structured comment templates with variable interpolation
 * and conditional blocks for Jira issue comments.
 */

export { BUILT_IN_TEMPLATES } from './built-in.js';
export { renderTemplate } from './renderer.js';
export { TemplateRegistry } from './registry.js';
export {
  TEMPLATE_CATEGORIES,
  type CommentTemplate,
  type RenderError,
  type RenderResult,
  type TemplateCategory,
  type TemplateRenderOutput,
  type TemplateVariable,
} from './types.js';
