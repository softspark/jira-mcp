/**
 * Type definitions for single-task template files used by create_task.
 *
 * Task templates use a markdown body for the description and a separate
 * summary template string in metadata. Both support {{variable}} placeholders
 * and {{#variable}}...{{/variable}} conditional blocks.
 */

import type { TemplateVariable, TemplateSource } from './types.js';

export interface TaskTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly summary: string;
  readonly issueType?: string;
  readonly priority?: string;
  readonly labels?: readonly string[];
  readonly epicKey?: string;
  readonly variables: readonly TemplateVariable[];
  /** Markdown description body with placeholders and conditionals. */
  readonly body: string;
  readonly source?: TemplateSource;
  readonly filePath?: string;
}
