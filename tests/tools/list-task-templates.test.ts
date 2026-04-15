/**
 * Tests for the list_task_templates tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleListTaskTemplates } from '../../src/tools/list-task-templates';
import { createMockTaskTemplateRegistry, asTaskRegistry } from '../fixtures/mocks';
import type { TaskTemplate } from '../../src/templates/task-types';

function parseResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

function sampleTaskTemplate(overrides?: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: 'default-task',
    name: 'Default Task',
    description: 'Generic task template',
    summary: '{{summary}}',
    issueType: 'Task',
    priority: 'Medium',
    labels: ['ops'],
    variables: [
      { name: 'summary', description: 'Task summary', required: true },
    ],
    body: '## Context\n{{context}}',
    source: 'system',
    filePath: '/templates/default-task.md',
    ...overrides,
  };
}

describe('handleListTaskTemplates', () => {
  it('lists available task templates', async () => {
    const registry = createMockTaskTemplateRegistry();
    registry.listTemplates.mockReturnValue([
      sampleTaskTemplate(),
      sampleTaskTemplate({ id: 'bug-task', name: 'Bug Task', issueType: 'Bug' }),
    ]);

    const result = await handleListTaskTemplates(
      {},
      { taskTemplateRegistry: asTaskRegistry(registry) },
    );

    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(2);
    const templates = parsed['templates'] as Array<Record<string, unknown>>;
    expect(templates[0]!['id']).toBe('default-task');
    expect(templates[0]!['source']).toBe('system');
  });
});
