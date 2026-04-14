/**
 * Type definitions for the comment template system.
 *
 * Templates use markdown with {{variable}} placeholders and
 * {{#variable}}...{{/variable}} conditional blocks.
 */

export const TEMPLATE_CATEGORIES = {
  WORKFLOW: 'workflow',
  COMMUNICATION: 'communication',
  REPORTING: 'reporting',
  DEVELOPMENT: 'development',
} as const;

export type TemplateCategory =
  (typeof TEMPLATE_CATEGORIES)[keyof typeof TEMPLATE_CATEGORIES];

export interface TemplateVariable {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: string;
  readonly example: string;
}

export interface CommentTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: TemplateCategory;
  readonly variables: readonly TemplateVariable[];
  /** Markdown body with {{variable}} placeholders and {{#var}}...{{/var}} conditionals. */
  readonly body: string;
}

export interface RenderResult {
  readonly markdown: string;
  readonly success: true;
}

export interface RenderError {
  readonly success: false;
  readonly error: string;
  readonly missingVariables: readonly string[];
}

export type TemplateRenderOutput = RenderResult | RenderError;
