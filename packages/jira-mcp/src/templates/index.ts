// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Comment template system barrel export.
 *
 * Provides structured comment templates with variable interpolation
 * and conditional blocks for Jira issue comments.
 */

export { BUILT_IN_TEMPLATES } from './built-in.js';
export { BUILT_IN_TASK_TEMPLATES } from './task-built-in.js';
// renderTemplate moved to @softspark/atlassian-mcp-core: the two constructs it
// supports are plain text substitution, shared with Confluence page templates.
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
