/**
 * Tests for the placeholder replacement engine.
 */

import { describe, it, expect } from 'vitest';

import {
  getCurrentPlaceholders,
  replacePlaceholders,
} from '../../src/bulk/placeholder';
import type { PlaceholderValues } from '../../src/bulk/placeholder';

describe('getCurrentPlaceholders', () => {
  it('returns correct values for a specific date', () => {
    const date = new Date('2026-04-13T12:00:00Z');
    const result = getCurrentPlaceholders(date);

    expect(result.MONTH).toBe('04.2026');
    expect(result.YEAR).toBe('2026');
    expect(result.DATE).toBe('2026-04-13');
  });

  it('zero-pads months less than 10', () => {
    const date = new Date('2026-01-05T12:00:00Z');
    const result = getCurrentPlaceholders(date);

    expect(result.MONTH).toBe('01.2026');
  });

  it('does not zero-pad months 10 or greater', () => {
    const date = new Date('2026-12-01T12:00:00Z');
    const result = getCurrentPlaceholders(date);

    expect(result.MONTH).toBe('12.2026');
  });

  it('returns current date when no argument given', () => {
    const result = getCurrentPlaceholders();
    const now = new Date();
    const expectedYear = String(now.getFullYear());

    expect(result.YEAR).toBe(expectedYear);
    expect(result.DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.MONTH).toMatch(/^\d{2}\.\d{4}$/);
  });
});

describe('replacePlaceholders', () => {
  const values: PlaceholderValues = {
    MONTH: '04.2026',
    YEAR: '2026',
    DATE: '2026-04-13',
  };

  it('replaces placeholders in a plain string', () => {
    const result = replacePlaceholders('Admin tasks {MONTH}', values);
    expect(result).toBe('Admin tasks 04.2026');
  });

  it('replaces all placeholder types in one string', () => {
    const result = replacePlaceholders(
      'Date: {DATE}, Month: {MONTH}, Year: {YEAR}',
      values,
    );
    expect(result).toBe('Date: 2026-04-13, Month: 04.2026, Year: 2026');
  });

  it('replaces placeholders in nested objects', () => {
    const input = {
      summary: 'Task {MONTH}',
      details: {
        created: '{DATE}',
        year: '{YEAR}',
      },
    };
    const result = replacePlaceholders(input, values);

    expect(result.summary).toBe('Task 04.2026');
    expect(result.details.created).toBe('2026-04-13');
    expect(result.details.year).toBe('2026');
  });

  it('replaces placeholders in arrays', () => {
    const input = ['Label {MONTH}', 'Year {YEAR}'];
    const result = replacePlaceholders(input, values);

    expect(result).toEqual(['Label 04.2026', 'Year 2026']);
  });

  it('replaces multiple occurrences of the same placeholder', () => {
    const result = replacePlaceholders(
      '{MONTH} and {MONTH} again',
      values,
    );
    expect(result).toBe('04.2026 and 04.2026 again');
  });

  it('returns value unchanged when no placeholders present', () => {
    const input = { summary: 'No placeholders here', count: 42 };
    const result = replacePlaceholders(input, values);

    expect(result).toEqual(input);
  });

  it('handles empty string', () => {
    const result = replacePlaceholders('', values);
    expect(result).toBe('');
  });

  it('uses current date when values not provided', () => {
    const now = new Date();
    const expectedYear = String(now.getFullYear());
    const result = replacePlaceholders('Year: {YEAR}');

    expect(result).toBe(`Year: ${expectedYear}`);
  });

  it('handles null and boolean values without corruption', () => {
    const input = { active: true, note: null, label: '{MONTH}' };
    const result = replacePlaceholders(input, values);

    expect(result.active).toBe(true);
    expect(result.note).toBeNull();
    expect(result.label).toBe('04.2026');
  });
});
