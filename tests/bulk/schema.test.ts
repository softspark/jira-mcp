/**
 * Tests for bulk operation Zod schemas.
 */

import { describe, it, expect } from 'vitest';

import {
  TaskConfigSchema,
  BulkOptionsSchema,
  BulkConfigSchema,
} from '../../src/bulk/schema';

describe('TaskConfigSchema', () => {
  it('accepts valid task with all fields', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'Monthly admin tasks 04.2026',
      summary_en: 'Monthly admin tasks 04.2026',
      description: 'Recurring DevOps tasks',
      description_en: 'Recurring DevOps tasks',
      type: 'Task',
      assignee: 'user@example.com',
      priority: 'High',
      labels: ['DevOps', 'monthly'],
      estimate_hours: 8,
      status: 'To Do',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal task with only summary', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'Minimal task',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('Medium');
      expect(result.data.type).toBe('Task');
      expect(result.data.labels).toEqual([]);
      expect(result.data.description).toBe('');
    }
  });

  it('rejects empty summary', () => {
    const result = TaskConfigSchema.safeParse({
      summary: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing summary', () => {
    const result = TaskConfigSchema.safeParse({
      type: 'Task',
      priority: 'Medium',
    });
    expect(result.success).toBe(false);
  });

  it('rejects summary exceeding 255 characters', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'x'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('accepts summary_en as optional', () => {
    const withEn = TaskConfigSchema.safeParse({
      summary: 'PL title',
      summary_en: 'EN title',
    });
    const withoutEn = TaskConfigSchema.safeParse({
      summary: 'PL title',
    });
    expect(withEn.success).toBe(true);
    expect(withoutEn.success).toBe(true);
  });

  it('rejects invalid assignee email', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'Task',
      assignee: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('validates priority enum values', () => {
    const validPriorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
    for (const priority of validPriorities) {
      const result = TaskConfigSchema.safeParse({ summary: 'Task', priority });
      expect(result.success).toBe(true);
    }

    const result = TaskConfigSchema.safeParse({
      summary: 'Task',
      priority: 'Critical',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative estimate_hours', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'Task',
      estimate_hours: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero estimate_hours', () => {
    const result = TaskConfigSchema.safeParse({
      summary: 'Task',
      estimate_hours: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('BulkOptionsSchema', () => {
  it('applies all defaults when empty object given', () => {
    const result = BulkOptionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        dry_run: true,
        update_existing: false,
        match_field: 'summary',
        rate_limit_ms: 500,
        force_reassign: false,
        reassign_delay_ms: 0,
        language: 'pl',
      });
    }
  });

  it('preserves explicit values over defaults', () => {
    const result = BulkOptionsSchema.safeParse({
      dry_run: false,
      rate_limit_ms: 1000,
      language: 'en',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(false);
      expect(result.data.rate_limit_ms).toBe(1000);
      expect(result.data.language).toBe('en');
    }
  });

  it('rejects negative rate_limit_ms', () => {
    const result = BulkOptionsSchema.safeParse({
      rate_limit_ms: -100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid language', () => {
    const result = BulkOptionsSchema.safeParse({
      language: 'xx',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all supported languages', () => {
    for (const lang of ['pl', 'en', 'de', 'es', 'fr', 'pt', 'it', 'nl']) {
      const result = BulkOptionsSchema.safeParse({ language: lang });
      expect(result.success).toBe(true);
    }
  });
});

describe('BulkConfigSchema', () => {
  it('accepts valid config with all fields', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'PROJ-123',
      tasks: [
        { summary: 'Task 1', priority: 'High', assignee: 'user@test.com' },
        { summary: 'Task 2', labels: ['DevOps'] },
      ],
      options: { dry_run: false },
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal config with epic_key and one task', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'ABC-1',
      tasks: [{ summary: 'Single task' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options.dry_run).toBe(true);
      expect(result.data.tasks[0]!.priority).toBe('Medium');
    }
  });

  it('rejects missing epic_key', () => {
    const result = BulkConfigSchema.safeParse({
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty tasks array', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'PROJ-1',
      tasks: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid epic key format - lowercase', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'proj-123',
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid epic key format - no number', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'PROJ-',
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid epic key format - no dash', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'PROJ123',
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts epic key with numbers in project part', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'E8A-202',
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(true);
  });

  it('applies default options when omitted', () => {
    const result = BulkConfigSchema.safeParse({
      epic_key: 'PROJ-1',
      tasks: [{ summary: 'Task' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.options.dry_run).toBe(true);
      expect(result.data.options.language).toBe('pl');
    }
  });
});
