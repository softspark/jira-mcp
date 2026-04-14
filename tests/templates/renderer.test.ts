/**
 * Tests for the template rendering engine.
 */

import { describe, it, expect } from 'vitest';

import { renderTemplate } from '../../src/templates/renderer';
import type { CommentTemplate } from '../../src/templates/types';

function createTestTemplate(
  overrides?: Partial<CommentTemplate>,
): CommentTemplate {
  return {
    id: 'test-template',
    name: 'Test Template',
    description: 'A test template',
    category: 'workflow',
    variables: [
      {
        name: 'title',
        description: 'The title',
        required: true,
        example: 'My Title',
      },
      {
        name: 'body',
        description: 'The body text',
        required: true,
        example: 'Some body',
      },
      {
        name: 'footer',
        description: 'Optional footer',
        required: false,
        defaultValue: 'Default footer',
        example: 'My footer',
      },
      {
        name: 'notes',
        description: 'Optional notes',
        required: false,
        example: 'Some notes',
      },
    ],
    body: '## {{title}}\n\n{{body}}\n\n{{#notes}}### Notes\n{{notes}}{{/notes}}\n\n**Footer:** {{footer}}',
    ...overrides,
  };
}

describe('renderTemplate', () => {
  describe('variable substitution', () => {
    it('replaces simple variables', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Hello',
        body: 'World',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toContain('## Hello');
        expect(result.markdown).toContain('World');
      }
    });

    it('replaces multiple variables in one template', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        body: 'Body Content',
        footer: 'Custom Footer',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toContain('Title');
        expect(result.markdown).toContain('Body Content');
        expect(result.markdown).toContain('Custom Footer');
      }
    });

    it('uses default value when optional variable is not provided', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        body: 'Body',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toContain('Default footer');
      }
    });

    it('preserves special characters in variable values', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title with <html> & "quotes"',
        body: 'Body',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toContain('<html>');
        expect(result.markdown).toContain('&');
        expect(result.markdown).toContain('"quotes"');
      }
    });
  });

  describe('missing required variables', () => {
    it('returns error when required variable is missing', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        // body is missing (required)
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.missingVariables).toContain('body');
        expect(result.error).toContain('body');
      }
    });

    it('lists all missing required variables', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.missingVariables).toContain('title');
        expect(result.missingVariables).toContain('body');
        expect(result.missingVariables).toHaveLength(2);
      }
    });
  });

  describe('conditional blocks', () => {
    it('renders conditional block when variable is present and non-empty', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        body: 'Body',
        notes: 'Important note',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toContain('### Notes');
        expect(result.markdown).toContain('Important note');
      }
    });

    it('removes conditional block when variable is absent', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        body: 'Body',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).not.toContain('### Notes');
      }
    });

    it('removes conditional block when variable is empty string', () => {
      const template = createTestTemplate();
      const result = renderTemplate(template, {
        title: 'Title',
        body: 'Body',
        notes: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).not.toContain('### Notes');
      }
    });
  });

  describe('output formatting', () => {
    it('trims leading and trailing whitespace', () => {
      const template = createTestTemplate({
        variables: [
          {
            name: 'x',
            description: 'x',
            required: true,
            example: 'x',
          },
        ],
        body: '  \n\n  {{x}}  \n\n  ',
      });

      const result = renderTemplate(template, { x: 'content' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).not.toMatch(/^\s/);
        expect(result.markdown).not.toMatch(/\s$/);
      }
    });

    it('collapses excessive blank lines from removed conditionals', () => {
      const template = createTestTemplate({
        variables: [
          {
            name: 'required',
            description: 'r',
            required: true,
            example: 'r',
          },
          {
            name: 'optional',
            description: 'o',
            required: false,
            example: 'o',
          },
        ],
        body: '{{required}}\n\n\n\n\n{{#optional}}content{{/optional}}\n\nend',
      });

      const result = renderTemplate(template, { required: 'start' });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should not have 3+ consecutive newlines
        expect(result.markdown).not.toMatch(/\n{3,}/);
      }
    });
  });

  describe('edge cases', () => {
    it('handles template with no variables defined', () => {
      const template = createTestTemplate({
        variables: [],
        body: 'Static content only',
      });

      const result = renderTemplate(template, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toBe('Static content only');
      }
    });

    it('replaces unreferenced optional variables with empty string', () => {
      const template = createTestTemplate({
        variables: [],
        body: 'before {{unknown}} after',
      });

      const result = renderTemplate(template, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.markdown).toBe('before  after');
      }
    });
  });
});
