/**
 * Tool handler: get_project_language
 *
 * Returns the configured language for a project. Used by AI assistants
 * to determine which language to use for comments and descriptions.
 *
 * @module
 */

import type { JiraConfig } from '../config/schema.js';
import type { ToolResult } from './helpers.js';
import { success, failure } from './helpers.js';

export interface GetProjectLanguageArgs {
  readonly project_key: string;
}

export interface GetProjectLanguageDeps {
  readonly config: JiraConfig;
}

/**
 * Get the configured language for a project.
 */
export async function handleGetProjectLanguage(
  args: GetProjectLanguageArgs,
  deps: GetProjectLanguageDeps,
): Promise<ToolResult> {
  try {
    const project = deps.config.projects[args.project_key];
    const language = project?.language ?? deps.config.default_language;

    return success({
      project_key: args.project_key,
      language,
      source: project?.language ? 'project' : 'default',
      message: `Project ${args.project_key} language: ${language}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
