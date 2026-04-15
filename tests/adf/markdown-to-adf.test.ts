/**
 * Tests for the markdown-to-ADF conversion wrapper.
 */

import { describe, it, expect } from 'vitest';

import { markdownToAdf } from '../../src/adf/markdown-to-adf';
import { adfToMarkdown } from '../../src/adf/adf-to-markdown';

describe('markdownToAdf', () => {
  it('converts a simple paragraph', () => {
    const result = markdownToAdf('Hello world');

    expect(result.version).toBe(1);
    expect(result.type).toBe('doc');
    expect(result.content.length).toBeGreaterThanOrEqual(1);
  });

  it('converts a heading', () => {
    const result = markdownToAdf('# My Heading');

    const headingNode = result.content.find((n) => n.type === 'heading');
    expect(headingNode).toBeDefined();
  });

  it('converts bold text', () => {
    const result = markdownToAdf('**bold text**');

    // Find paragraph with strong mark
    const paragraph = result.content.find((n) => n.type === 'paragraph');
    expect(paragraph).toBeDefined();

    const textNode = paragraph?.content?.find((n) => n.type === 'text');
    const hasBold = textNode?.marks?.some((m) => m.type === 'strong');
    expect(hasBold).toBe(true);
  });

  it('converts italic text', () => {
    const result = markdownToAdf('*italic text*');

    const paragraph = result.content.find((n) => n.type === 'paragraph');
    const textNode = paragraph?.content?.find((n) => n.type === 'text');
    const hasItalic = textNode?.marks?.some((m) => m.type === 'em');
    expect(hasItalic).toBe(true);
  });

  it('converts a code block', () => {
    const result = markdownToAdf('```\nconst x = 1;\n```');

    const codeBlock = result.content.find((n) => n.type === 'codeBlock');
    expect(codeBlock).toBeDefined();
  });

  it('converts an unordered list', () => {
    const result = markdownToAdf('- item 1\n- item 2');

    const list = result.content.find((n) => n.type === 'bulletList');
    expect(list).toBeDefined();
  });

  it('converts a markdown table into ADF table nodes', () => {
    const result = markdownToAdf(
      '| Name | Status |\n| --- | --- |\n| API | Done |\n| UI | In Progress |',
    );

    const table = result.content.find((n) => n.type === 'table');
    expect(table).toBeDefined();
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.type).toBe('tableRow');
    expect(table?.content?.[0]?.content?.[0]?.type).toBe('tableHeader');
    expect(
      table?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe('API');
  });

  it('round-trips markdown tables through ADF without flattening rows', () => {
    const markdown =
      '| Name | Notes |\n| --- | --- |\n| Parser | **Done** |\n| Docs | `Pending` |';

    const adf = markdownToAdf(markdown);
    const roundTrip = adfToMarkdown(adf);

    expect(roundTrip).toContain('| Name | Notes |');
    expect(roundTrip).toContain('| --- | --- |');
    expect(roundTrip).toContain('| Parser | **Done** |');
    expect(roundTrip).toContain('| Docs | `Pending` |');
  });

  it('returns fallback ADF for empty string', () => {
    const result = markdownToAdf('');

    expect(result.version).toBe(1);
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('paragraph');
  });

  it('returns fallback ADF for whitespace-only string', () => {
    const result = markdownToAdf('   ');

    expect(result.version).toBe(1);
    expect(result.type).toBe('doc');
    expect(result.content).toHaveLength(1);
  });

  it('never throws -- always returns valid ADF', () => {
    // Even weird input should not throw
    const inputs = [
      '',
      '   ',
      '# heading',
      '```\ncode\n```',
      '- list\n- items',
      'normal text',
      '## heading **with bold**',
    ];

    for (const input of inputs) {
      const result = markdownToAdf(input);
      expect(result.version).toBe(1);
      expect(result.type).toBe('doc');
      expect(Array.isArray(result.content)).toBe(true);
    }
  });

  it('normalizes literal \\n to real newlines', () => {
    const result = markdownToAdf('## Cel\\nParagraph text\\n\\n- item 1\\n- item 2');

    const heading = result.content.find((n) => n.type === 'heading');
    expect(heading).toBeDefined();
    expect(heading?.content?.[0]?.text).toBe('Cel');

    const list = result.content.find((n) => n.type === 'bulletList');
    expect(list).toBeDefined();
    expect(list?.content).toHaveLength(2);
  });

  it('handles multi-line markdown', () => {
    const markdown = `# Title

Some paragraph text.

- bullet 1
- bullet 2

**Bold** and *italic*`;

    const result = markdownToAdf(markdown);
    expect(result.content.length).toBeGreaterThanOrEqual(1);
  });
});
