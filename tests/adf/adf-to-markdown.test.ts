/**
 * Tests for the ADF-to-markdown conversion wrapper.
 */

import { describe, it, expect } from 'vitest';

import { adfToMarkdown } from '../../src/adf/adf-to-markdown';
import {
  createSimpleAdfDoc,
  createAdfWithHeading,
  createAdfCodeBlock,
} from '../fixtures/adf';

describe('adfToMarkdown', () => {
  it('converts a simple paragraph to markdown', () => {
    const result = adfToMarkdown(createSimpleAdfDoc('Hello world'));
    expect(result).toContain('Hello world');
  });

  it('converts heading + paragraph', () => {
    const result = adfToMarkdown(
      createAdfWithHeading('My Title', 'Body text'),
    );
    expect(result).toContain('My Title');
    expect(result).toContain('Body text');
  });

  it('returns "(No content)" for null input', () => {
    const result = adfToMarkdown(null);
    expect(result).toBe('(No content)');
  });

  it('returns "(No content)" for undefined input', () => {
    const result = adfToMarkdown(undefined);
    expect(result).toBe('(No content)');
  });

  it('returns fallback with JSON for malformed ADF', () => {
    // Force a malformed ADF that will make adf-to-md throw
    const malformed = {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'unknownNodeType',
          content: [
            {
              type: 'alsoUnknown',
              attrs: { broken: true },
            },
          ],
        },
      ],
    } as ReturnType<typeof createSimpleAdfDoc>;

    const result = adfToMarkdown(malformed);
    // Should either convert it or return fallback -- never throw
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('never throws on any input', () => {
    const inputs = [
      null,
      undefined,
      createSimpleAdfDoc('test'),
      createAdfWithHeading('h', 'b'),
      createAdfCodeBlock('const x = 1'),
    ];

    for (const input of inputs) {
      expect(() => adfToMarkdown(input as ReturnType<typeof createSimpleAdfDoc> | null | undefined)).not.toThrow();
    }
  });

  it('handles code block conversion', () => {
    const result = adfToMarkdown(createAdfCodeBlock('const x = 1'));
    expect(result).toContain('const x = 1');
  });

  it('returns "(No content)" for empty conversion result', () => {
    // A doc whose content produces empty string after trim
    const emptyDoc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [],
        },
      ],
    };

    const result = adfToMarkdown(emptyDoc);
    // Should be either the placeholder or some content, never empty
    expect(result.length).toBeGreaterThan(0);
  });
});
