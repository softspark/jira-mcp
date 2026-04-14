/**
 * Tool handler: add_templated_comment
 *
 * Adds a comment to a Jira task using either a registered template
 * (with variable substitution) or raw markdown. Both paths convert
 * to ADF before sending to the Jira API.
 *
 * @module
 */

import type { InstancePool } from '../connector/instance-pool.js';
import type { CacheManager } from '../cache/manager.js';
import type { TemplateRegistry } from '../templates/registry.js';
import { renderTemplate } from '../templates/renderer.js';
import type { ToolResult } from './helpers.js';
import { success, failure, getOperations } from './helpers.js';

export interface AddTemplatedCommentArgs {
  readonly task_key: string;
  readonly template_id?: string;
  readonly variables?: Readonly<Record<string, string>>;
  readonly markdown?: string;
}

export interface AddTemplatedCommentDeps {
  readonly pool: InstancePool;
  readonly cacheManager: CacheManager;
  readonly templateRegistry: TemplateRegistry;
}

/**
 * Add a comment using a template or raw markdown.
 *
 * Exactly one of `template_id` or `markdown` must be provided.
 * When using `template_id`, the `variables` map is used to fill
 * the template placeholders.
 */
export async function handleAddTemplatedComment(
  args: AddTemplatedCommentArgs,
  deps: AddTemplatedCommentDeps,
): Promise<ToolResult> {
  try {
    // Validate: exactly one source must be provided
    if (args.template_id && args.markdown) {
      return failure(
        new Error(
          'Provide either template_id or markdown, not both.',
        ),
      );
    }
    if (!args.template_id && !args.markdown) {
      return failure(
        new Error(
          'Provide either template_id (with variables) or markdown.',
        ),
      );
    }

    let finalMarkdown: string;
    let templateInfo: Record<string, unknown> | undefined;

    if (args.template_id) {
      // Template mode
      const template = deps.templateRegistry.getTemplate(args.template_id);
      const rendered = renderTemplate(template, args.variables ?? {});

      if (!rendered.success) {
        return failure(new Error(rendered.error));
      }

      finalMarkdown = rendered.markdown;
      templateInfo = {
        template_id: template.id,
        template_name: template.name,
      };
    } else {
      // Raw markdown mode
      finalMarkdown = args.markdown ?? '';
    }

    const ops = getOperations(deps.pool, deps.cacheManager, args.task_key);
    const result = await ops.addComment(args.task_key, finalMarkdown);

    return success({
      comment: {
        id: result.commentId,
        author: result.author,
        body: result.bodyMarkdown,
        created: result.created,
      },
      ...(templateInfo ? { template: templateInfo } : {}),
      message: `Added comment to ${args.task_key}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
