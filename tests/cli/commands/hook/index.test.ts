/**
 * Tests for the internal comment-approval hook runner.
 */

import { describe, expect, it } from 'vitest';

import { evaluateCommentApprovalHook } from '../../../../src/cli/commands/hook/index';
import { TemplateRegistry } from '../../../../src/templates/registry';
import type { CommentTemplate } from '../../../../src/templates/types';

function createRegistry(): TemplateRegistry {
  const template: CommentTemplate = {
    id: 'status-update',
    name: 'Status Update',
    description: 'Structured update',
    category: 'workflow',
    variables: [
      {
        name: 'completed',
        description: 'Completed work',
        required: true,
      },
    ],
    body: 'Completed:\n{{completed}}',
    source: 'user',
    filePath: '/tmp/status-update.md',
  };

  return new TemplateRegistry([template]);
}

describe('evaluateCommentApprovalHook', () => {
  it('allows comment tool calls already marked as approved', () => {
    const result = evaluateCommentApprovalHook(
      JSON.stringify({
        tool_name: 'mcp__jira__add_task_comment',
        tool_input: {
          task_key: 'PROJ-1',
          comment: 'Hello world',
          user_approved: true,
        },
      }),
      createRegistry(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it('blocks raw comment writes without approval and includes a preview', () => {
    const result = evaluateCommentApprovalHook(
      JSON.stringify({
        tool_name: 'mcp__jira__add_task_comment',
        tool_input: {
          task_key: 'PROJ-1',
          comment: 'Hello world',
        },
      }),
      createRegistry(),
    );

    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('Comment approval required');
    expect(result.message).toContain('Task: PROJ-1');
    expect(result.message).toContain('Hello world');
    expect(result.message).toContain('user_approved=true');
  });

  it('blocks templated comment writes without approval and renders the preview', () => {
    const result = evaluateCommentApprovalHook(
      JSON.stringify({
        tool_name: 'mcp__jira__add_templated_comment',
        tool_input: {
          task_key: 'PROJ-1',
          template_id: 'status-update',
          variables: {
            completed: 'Auth flow implemented',
          },
        },
      }),
      createRegistry(),
    );

    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('Template: status-update');
    expect(result.message).toContain('Completed:\nAuth flow implemented');
  });

  it('allows malformed template payload through so the tool can return its own validation error', () => {
    const result = evaluateCommentApprovalHook(
      JSON.stringify({
        tool_name: 'mcp__jira__add_templated_comment',
        tool_input: {
          task_key: 'PROJ-1',
          template_id: 'status-update',
          variables: {},
        },
      }),
      createRegistry(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });
});
