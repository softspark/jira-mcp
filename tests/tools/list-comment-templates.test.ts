/**
 * Tests for the list_comment_templates tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleListCommentTemplates } from '../../src/tools/list-comment-templates';
import type { CommentTemplate } from '../../src/templates/types';
import { createMockTemplateRegistry, asRegistry } from '../fixtures/mocks';

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

function sampleTemplate(overrides?: Partial<CommentTemplate>): CommentTemplate {
  return {
    id: 'status-update',
    name: 'Status Update',
    description: 'Post a status update',
    category: 'workflow',
    variables: [
      {
        name: 'status',
        description: 'Current status',
        required: true,
        example: 'In Progress',
      },
    ],
    body: 'Status: {{status}}',
    ...overrides,
  };
}

describe('handleListCommentTemplates', () => {
  it('lists all templates when no category filter', async () => {
    const registry = createMockTemplateRegistry();
    const templates = [
      sampleTemplate(),
      sampleTemplate({ id: 'code-review', name: 'Code Review', category: 'development' }),
    ];
    registry.listTemplates.mockReturnValue(templates);
    registry.listCategories.mockReturnValue(['workflow', 'development']);

    const result = await handleListCommentTemplates(
      {},
      { templateRegistry: asRegistry(registry) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(2);
    expect(parsed['categories']).toEqual(['workflow', 'development']);

    const tpls = parsed['templates'] as Array<Record<string, unknown>>;
    expect(tpls).toHaveLength(2);
    expect(tpls[0]!['id']).toBe('status-update');
  });

  it('filters by valid category', async () => {
    const registry = createMockTemplateRegistry();
    registry.listTemplates.mockReturnValue([sampleTemplate()]);
    registry.listCategories.mockReturnValue(['workflow']);

    const result = await handleListCommentTemplates(
      { category: 'workflow' },
      { templateRegistry: asRegistry(registry) },
    );

    expect(registry.listTemplates).toHaveBeenCalledWith('workflow');
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(1);
  });

  it('returns failure for invalid category', async () => {
    const registry = createMockTemplateRegistry();

    const result = await handleListCommentTemplates(
      { category: 'invalid-category' },
      { templateRegistry: asRegistry(registry) },
    );

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['error']).toContain('Invalid category');
    expect(parsed['error']).toContain('invalid-category');
  });

  it('maps template variables to output format', async () => {
    const registry = createMockTemplateRegistry();
    const tpl = sampleTemplate({
      variables: [
        {
          name: 'v1',
          description: 'First',
          required: true,
          example: 'ex1',
        },
        {
          name: 'v2',
          description: 'Second',
          required: false,
          example: 'ex2',
        },
      ],
    });
    registry.listTemplates.mockReturnValue([tpl]);
    registry.listCategories.mockReturnValue(['workflow']);

    const result = await handleListCommentTemplates(
      {},
      { templateRegistry: asRegistry(registry) },
    );

    const parsed = parseResult(result);
    const tpls = parsed['templates'] as Array<Record<string, unknown>>;
    const vars = tpls[0]!['variables'] as Array<Record<string, unknown>>;
    expect(vars).toHaveLength(2);
    expect(vars[0]!['name']).toBe('v1');
    expect(vars[0]!['required']).toBe(true);
    expect(vars[1]!['required']).toBe(false);
  });

  it('returns empty list when no templates match', async () => {
    const registry = createMockTemplateRegistry();
    registry.listTemplates.mockReturnValue([]);
    registry.listCategories.mockReturnValue([]);

    const result = await handleListCommentTemplates(
      { category: 'reporting' },
      { templateRegistry: asRegistry(registry) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(0);
    expect(parsed['templates']).toEqual([]);
  });
});
