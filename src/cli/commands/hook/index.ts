/**
 * Internal hook runners used by external hook injectors.
 *
 * These commands are intentionally hidden from normal CLI help output.
 * They are invoked from Claude Code / ai-toolkit hook definitions.
 */

import process from 'node:process';

import type { Command } from 'commander';

import { loadTemplateCatalog } from '../../../templates/catalog.js';
import { renderTemplate } from '../../../templates/renderer.js';
import type { TemplateRegistry } from '../../../templates/registry.js';
import { asOptionalBoolean, asOptionalRecord, asOptionalString } from '../../../tools/args.js';

interface HookPayload {
  readonly tool_name?: string;
  readonly tool_input?: Readonly<Record<string, unknown>>;
}

interface CommentApprovalHookDecision {
  readonly exitCode: 0 | 2;
  readonly message?: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeToolName(toolName: string | undefined): string {
  if (!toolName) {
    return 'unknown-tool';
  }
  const parts = toolName.split('__');
  return parts[parts.length - 1] ?? toolName;
}

function truncatePreview(markdown: string, maxLength = 1500): string {
  const trimmed = markdown.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}\n\n[preview truncated]`;
}

function buildApprovalMessage(
  toolName: string | undefined,
  taskKey: string | undefined,
  preview: string,
  templateId?: string,
): string {
  const lines = [
    'Comment approval required before Jira comment write.',
    `Tool: ${normalizeToolName(toolName)}`,
    ...(taskKey ? [`Task: ${taskKey}`] : []),
    ...(templateId ? [`Template: ${templateId}`] : []),
    'Preview:',
    '---',
    truncatePreview(preview),
    '---',
    'Ask the user to approve this exact comment. If approved, rerun the same tool call with user_approved=true.',
  ];

  return lines.join('\n');
}

function resolvePreview(
  toolInput: Readonly<Record<string, unknown>>,
  templateRegistry: TemplateRegistry,
): { readonly markdown: string; readonly templateId?: string } | undefined {
  const comment = asOptionalString(toolInput['comment']);
  if (comment && comment.trim().length > 0) {
    return { markdown: comment };
  }

  const markdown = asOptionalString(toolInput['markdown']);
  if (markdown && markdown.trim().length > 0) {
    return { markdown };
  }

  const templateId = asOptionalString(toolInput['template_id']);
  if (!templateId) {
    return undefined;
  }

  try {
    const template = templateRegistry.getTemplate(templateId);
    const rendered = renderTemplate(
      template,
      asOptionalRecord(toolInput['variables']) ?? {},
    );

    if (!rendered.success) {
      return undefined;
    }

    return {
      markdown: rendered.markdown,
      templateId,
    };
  } catch {
    return undefined;
  }
}

export function evaluateCommentApprovalHook(
  rawInput: string,
  templateRegistry: TemplateRegistry,
): CommentApprovalHookDecision {
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return { exitCode: 0 };
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(trimmed) as HookPayload;
  } catch {
    return { exitCode: 0 };
  }

  const toolInput = isRecord(payload.tool_input) ? payload.tool_input : undefined;
  if (!toolInput) {
    return { exitCode: 0 };
  }

  if (asOptionalBoolean(toolInput['user_approved']) === true) {
    return { exitCode: 0 };
  }

  const preview = resolvePreview(toolInput, templateRegistry);
  if (!preview) {
    return { exitCode: 0 };
  }

  return {
    exitCode: 2,
    message: buildApprovalMessage(
      asOptionalString(payload.tool_name),
      asOptionalString(toolInput['task_key']),
      preview.markdown,
      preview.templateId,
    ),
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString('utf-8');
}

export async function handleCommentApprovalHook(
  rawInput?: string,
  templateRegistry?: TemplateRegistry,
): Promise<CommentApprovalHookDecision> {
  const input = rawInput ?? await readStdin();
  const registry =
    templateRegistry ?? loadTemplateCatalog().commentRegistry;

  return evaluateCommentApprovalHook(input, registry);
}

export function registerHookCommands(parent: Command): void {
  const hook = parent
    .command('hook')
    .description('Internal hook runners');

  hook
    .command('comment-approval')
    .description('Internal PreToolUse guard for Jira comment approval')
    .action(async () => {
      const decision = await handleCommentApprovalHook();
      if (decision.message) {
        console.error(decision.message);
      }
      process.exitCode = decision.exitCode;
    });
}
