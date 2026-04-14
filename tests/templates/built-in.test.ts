/**
 * Tests for built-in comment templates.
 */

import { describe, it, expect } from 'vitest';

import { BUILT_IN_TEMPLATES } from '../../src/templates/built-in';
import { TEMPLATE_CATEGORIES } from '../../src/templates/types';
import { renderTemplate } from '../../src/templates/renderer';

const VALID_CATEGORIES = new Set<string>(Object.values(TEMPLATE_CATEGORIES));

describe('BUILT_IN_TEMPLATES', () => {
  it('contains exactly 8 templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(8);
  });

  it('all templates have unique ids', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all templates have required variables defined', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      expect(template.variables).toBeDefined();
      expect(Array.isArray(template.variables)).toBe(true);
      // Each template should have at least one variable
      expect(template.variables.length).toBeGreaterThan(0);
    }
  });

  it('all template bodies contain valid {{variable}} placeholders', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const variableNames = template.variables.map((v) => v.name);
      // Find all {{var}} references in the body (excluding conditionals)
      const placeholders = [
        ...template.body.matchAll(/\{\{(?!#|\/)([\w]+)\}\}/g),
      ].map((m) => m[1]);

      for (const placeholder of placeholders) {
        expect(
          variableNames,
          `Template "${template.id}" references {{${placeholder}}} but it is not defined in variables`,
        ).toContain(placeholder);
      }
    }
  });

  it('all templates have a valid category', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      expect(
        VALID_CATEGORIES.has(template.category),
        `Template "${template.id}" has invalid category "${template.category}"`,
      ).toBe(true);
    }
  });

  it('each template renders successfully with example values', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const variables: Record<string, string> = {};
      for (const v of template.variables) {
        variables[v.name] = v.example;
      }

      const result = renderTemplate(template, variables);

      expect(
        result.success,
        `Template "${template.id}" failed to render: ${'error' in result ? result.error : ''}`,
      ).toBe(true);

      if (result.success) {
        expect(result.markdown.length).toBeGreaterThan(0);
      }
    }
  });
});
