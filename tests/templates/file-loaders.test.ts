/**
 * Tests for file-backed template loading and merged catalog behavior.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadCommentTemplatesFromDirectorySync,
  loadTaskTemplatesFromDirectorySync,
} from '../../src/templates/file-loaders';
import { loadTemplateCatalog } from '../../src/templates/catalog';

describe('file-backed template loaders', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-template-loader-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('loads comment templates from markdown files', async () => {
    const dir = join(tempDir, 'comments');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'status-update.md'),
      `---
{
  "kind": "comment",
  "id": "status-update",
  "name": "Status Update",
  "description": "Status comment",
  "category": "workflow",
  "variables": [
    { "name": "completed", "required": true }
  ]
}
---
Done: {{completed}}
`,
      'utf-8',
    );

    const templates = loadCommentTemplatesFromDirectorySync(dir, 'user');

    expect(templates).toHaveLength(1);
    expect(templates[0]?.id).toBe('status-update');
    expect(templates[0]?.source).toBe('user');
  });

  it('loads task templates from markdown files', async () => {
    const dir = join(tempDir, 'task-templates');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'default-task.md'),
      `---
{
  "kind": "task",
  "id": "default-task",
  "name": "Default Task",
  "description": "Task template",
  "summary": "{{summary}}",
  "variables": [
    { "name": "summary", "required": true }
  ]
}
---
Body: {{summary}}
`,
      'utf-8',
    );

    const templates = loadTaskTemplatesFromDirectorySync(dir, 'user');

    expect(templates).toHaveLength(1);
    expect(templates[0]?.id).toBe('default-task');
    expect(templates[0]?.summary).toBe('{{summary}}');
  });

  it('merged catalog prefers user override over system template', async () => {
    const commentsDir = join(tempDir, 'comments');
    const tasksDir = join(tempDir, 'task-templates');
    await mkdir(commentsDir, { recursive: true });
    await mkdir(tasksDir, { recursive: true });

    await writeFile(
      join(commentsDir, 'status-update.md'),
      `---
{
  "kind": "comment",
  "id": "status-update",
  "name": "Custom Status Update",
  "description": "Override",
  "category": "workflow",
  "variables": [
    { "name": "completed", "required": true }
  ]
}
---
Custom: {{completed}}
`,
      'utf-8',
    );

    await writeFile(
      join(tasksDir, 'default-task.md'),
      `---
{
  "kind": "task",
  "id": "default-task",
  "name": "Custom Default Task",
  "description": "Override",
  "summary": "Custom {{summary}}",
  "variables": [
    { "name": "summary", "required": true }
  ]
}
---
Custom body
`,
      'utf-8',
    );

    const catalog = loadTemplateCatalog({
      commentTemplatesDir: commentsDir,
      taskTemplatesDir: tasksDir,
    });

    expect(catalog.commentRegistry.getTemplate('status-update').name).toBe(
      'Custom Status Update',
    );
    expect(catalog.taskRegistry.getTemplate('default-task').name).toBe(
      'Custom Default Task',
    );
  });
});
