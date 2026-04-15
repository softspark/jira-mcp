/**
 * Tests for template management command handlers.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleAddTemplate,
  handleListTemplates,
  handleRemoveTemplate,
  handleShowTemplate,
} from '../../../../src/cli/commands/template/index';

describe('template command handlers', () => {
  let configDir: string;
  let sourceDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'jira-mcp-template-config-'));
    sourceDir = await mkdtemp(join(tmpdir(), 'jira-mcp-template-source-'));
    await mkdir(join(configDir, 'templates', 'comments'), { recursive: true });
    await mkdir(join(configDir, 'templates', 'task-templates'), { recursive: true });
  });

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it('adds a comment template into the global override directory', async () => {
    const sourceFile = join(sourceDir, 'team-note.md');
    await writeFile(
      sourceFile,
      `---
{
  "kind": "comment",
  "id": "team-note",
  "name": "Team Note",
  "description": "Custom note",
  "category": "communication",
  "variables": []
}
---
Hello team
`,
      'utf-8',
    );

    const result = await handleAddTemplate(configDir, 'comment', sourceFile);

    expect(result.id).toBe('team-note');
    expect(result.destination).toContain('/templates/comments/team-note.md');
  });

  it('lists active templates including user overrides', async () => {
    const sourceFile = join(sourceDir, 'default-task.md');
    await writeFile(
      sourceFile,
      `---
{
  "kind": "task",
  "id": "default-task",
  "name": "Custom Default Task",
  "description": "Override",
  "summary": "{{summary}}",
  "variables": [
    { "name": "summary", "required": true }
  ]
}
---
Custom body
`,
      'utf-8',
    );

    await handleAddTemplate(configDir, 'task', sourceFile);
    const rows = handleListTemplates(configDir, 'task');
    const ids = rows.map((row) => row[1]);

    expect(ids).toContain('default-task');
    expect(rows.find((row) => row[1] === 'default-task')?.[2]).toBe('user');
  });

  it('shows the active template content', async () => {
    const sourceFile = join(sourceDir, 'team-note.md');
    await writeFile(
      sourceFile,
      `---
{
  "kind": "comment",
  "id": "team-note",
  "name": "Team Note",
  "description": "Custom note",
  "category": "communication",
  "variables": []
}
---
Hello team
`,
      'utf-8',
    );

    await handleAddTemplate(configDir, 'comment', sourceFile);
    const result = await handleShowTemplate(configDir, 'comment', 'team-note');

    expect(result.content).toContain('Hello team');
    expect(result.filePath).toContain('/templates/comments/team-note.md');
  });

  it('removes a user-installed template override', async () => {
    const sourceFile = join(sourceDir, 'team-note.md');
    await writeFile(
      sourceFile,
      `---
{
  "kind": "comment",
  "id": "team-note",
  "name": "Team Note",
  "description": "Custom note",
  "category": "communication",
  "variables": []
}
---
Hello team
`,
      'utf-8',
    );

    await handleAddTemplate(configDir, 'comment', sourceFile);
    await handleRemoveTemplate(configDir, 'comment', 'team-note');

    const rows = handleListTemplates(configDir, 'comment');
    expect(rows.map((row) => row[1])).not.toContain('team-note');
  });
});
