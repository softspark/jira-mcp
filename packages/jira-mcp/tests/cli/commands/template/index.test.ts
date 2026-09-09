// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for template management command handlers.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  handleAddBulkTemplate,
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
    const rows = await handleListTemplates(configDir, 'task');
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

    const rows = await handleListTemplates(configDir, 'comment');
    expect(rows.map((row) => row[1])).not.toContain('team-note');
  });

  // -------------------------------------------------------------------------
  // Bulk templates
  // -------------------------------------------------------------------------

  function buildBulkConfig(epicKey: string): string {
    return JSON.stringify({
      epic_key: epicKey,
      tasks: [
        {
          summary: 'Prace administracyjne DevOps {MONTH}',
          type: 'Task',
          assignee: 'lem@spyro-soft.com',
          priority: 'Medium',
          labels: ['DevOps'],
          estimate_hours: 8,
          status: 'To Do',
        },
      ],
      options: {
        dry_run: true,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 500,
      },
    });
  }

  it('adds a bulk template under templates/tasks/<KEY>/monthly_admin.json', async () => {
    const sourceFile = join(sourceDir, 'puc.json');
    await writeFile(sourceFile, buildBulkConfig('PUC-34'), 'utf-8');

    const result = await handleAddBulkTemplate(configDir, sourceFile, 'puc');

    expect(result.id).toBe('PUC');
    expect(result.destination).toContain('/templates/tasks/PUC/monthly_admin.json');

    const written = await readFile(result.destination, 'utf-8');
    expect(JSON.parse(written)).toMatchObject({ epic_key: 'PUC-34' });
  });

  it('rejects bulk templates with invalid JSON', async () => {
    const sourceFile = join(sourceDir, 'broken.json');
    await writeFile(sourceFile, '{ not json', 'utf-8');

    await expect(
      handleAddBulkTemplate(configDir, sourceFile, 'PUC'),
    ).rejects.toThrow(/Invalid JSON/);
  });

  it('rejects bulk templates that fail BulkConfigSchema validation', async () => {
    const sourceFile = join(sourceDir, 'bad-schema.json');
    await writeFile(
      sourceFile,
      JSON.stringify({ epic_key: 'not-a-key', tasks: [] }),
      'utf-8',
    );

    await expect(
      handleAddBulkTemplate(configDir, sourceFile, 'PUC'),
    ).rejects.toThrow(/Invalid bulk config/);
  });

  it('rejects invalid project keys', async () => {
    const sourceFile = join(sourceDir, 'puc.json');
    await writeFile(sourceFile, buildBulkConfig('PUC-34'), 'utf-8');

    await expect(
      handleAddBulkTemplate(configDir, sourceFile, '123-bad'),
    ).rejects.toThrow(/Invalid project key/);
  });

  it('lists bulk templates alongside comment and task templates', async () => {
    const bulkSource = join(sourceDir, 'biel.json');
    await writeFile(bulkSource, buildBulkConfig('BIEL-2'), 'utf-8');
    await handleAddBulkTemplate(configDir, bulkSource, 'BIEL');

    const rows = await handleListTemplates(configDir);
    const bulkRow = rows.find((row) => row[0] === 'bulk' && row[1] === 'BIEL');

    expect(bulkRow).toBeDefined();
    expect(bulkRow?.[4]).toContain('/templates/tasks/BIEL/monthly_admin.json');
  });

  it('filters list to bulk templates only', async () => {
    const bulkSource = join(sourceDir, 'cdm.json');
    await writeFile(bulkSource, buildBulkConfig('CDM-1972'), 'utf-8');
    await handleAddBulkTemplate(configDir, bulkSource, 'CDM');

    const rows = await handleListTemplates(configDir, 'bulk');
    expect(rows.length).toBe(1);
    expect(rows[0]?.[0]).toBe('bulk');
    expect(rows[0]?.[1]).toBe('CDM');
  });

  it('shows a bulk template by project key', async () => {
    const bulkSource = join(sourceDir, 'rom.json');
    await writeFile(bulkSource, buildBulkConfig('ROM-558'), 'utf-8');
    await handleAddBulkTemplate(configDir, bulkSource, 'ROM');

    const result = await handleShowTemplate(configDir, 'bulk', 'rom');

    expect(result.filePath).toContain('/templates/tasks/ROM/monthly_admin.json');
    expect(JSON.parse(result.content)).toMatchObject({ epic_key: 'ROM-558' });
  });

  it('removes a bulk template and prunes the empty project directory', async () => {
    const bulkSource = join(sourceDir, 'ves.json');
    await writeFile(bulkSource, buildBulkConfig('VES-894'), 'utf-8');
    const added = await handleAddBulkTemplate(configDir, bulkSource, 'VES');

    await handleRemoveTemplate(configDir, 'bulk', 'ves');

    await expect(readFile(added.destination, 'utf-8')).rejects.toThrow();

    const rows = await handleListTemplates(configDir, 'bulk');
    expect(rows.length).toBe(0);
  });

  it('errors when removing a bulk template that does not exist', async () => {
    await expect(
      handleRemoveTemplate(configDir, 'bulk', 'NOPE'),
    ).rejects.toThrow(/not found/);
  });
});
