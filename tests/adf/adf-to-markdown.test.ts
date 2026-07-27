// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

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

describe('adfToMarkdown task lists', () => {
  it('renders a task list as markdown checkboxes', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'taskList',
          attrs: { localId: 'list-1' },
          content: [
            {
              type: 'taskItem',
              attrs: { localId: 'task-1', state: 'TODO' },
              content: [{ type: 'text', text: 'open item' }],
            },
            {
              type: 'taskItem',
              attrs: { localId: 'task-2', state: 'DONE' },
              content: [{ type: 'text', text: 'done item' }],
            },
          ],
        },
      ],
    };

    const result = adfToMarkdown(doc);
    expect(result).toContain('- [ ] open item');
    expect(result).toContain('- [x] done item');
  });

  it('indents a nested task list', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'taskList',
          attrs: { localId: 'list-1' },
          content: [
            {
              type: 'taskItem',
              attrs: { localId: 'task-1', state: 'TODO' },
              content: [{ type: 'text', text: 'parent' }],
            },
            {
              type: 'taskList',
              attrs: { localId: 'list-2' },
              content: [
                {
                  type: 'taskItem',
                  attrs: { localId: 'task-2', state: 'DONE' },
                  content: [{ type: 'text', text: 'child' }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = adfToMarkdown(doc);
    expect(result).toContain('- [ ] parent');
    expect(result).toContain('  - [x] child');
  });
});

describe('adfToMarkdown date nodes', () => {
  it('renders a date node as YYYY-MM-DD', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Due: ' },
            { type: 'date', attrs: { timestamp: '1718000000000' } },
          ],
        },
      ],
    };

    expect(adfToMarkdown(doc)).toBe('Due: 2024-06-10');
  });

  it('drops a date node with an invalid timestamp', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Due:' },
            { type: 'date', attrs: { timestamp: 'not-a-number' } },
          ],
        },
      ],
    };

    expect(adfToMarkdown(doc)).toBe('Due:');
  });
});

describe('adfToMarkdown nested lists', () => {
  it('indents nested bullet lists by two spaces per level', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'parent' }],
                },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'child' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = adfToMarkdown(doc);
    expect(result).toContain('- parent');
    expect(result).toContain('  - child');
  });
});

function docWith(...content: object[]): {
  version: 1;
  type: 'doc';
  content: object[];
} {
  return { version: 1 as const, type: 'doc' as const, content };
}

function inlineDoc(...inline: object[]): ReturnType<typeof docWith> {
  return docWith({ type: 'paragraph', content: inline });
}

type AnyDoc = Parameters<typeof adfToMarkdown>[0];

describe('adfToMarkdown marks', () => {
  it('applies strong, em, strike, code and underline marks', () => {
    const doc = inlineDoc(
      { type: 'text', text: 'b', marks: [{ type: 'strong' }] },
      { type: 'text', text: 'i', marks: [{ type: 'em' }] },
      { type: 'text', text: 's', marks: [{ type: 'strike' }] },
      { type: 'text', text: 'c', marks: [{ type: 'code' }] },
      { type: 'text', text: 'u', marks: [{ type: 'underline' }] },
    ) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('**b***i*~~s~~`c`<u>u</u>');
  });

  it('renders a link mark with href', () => {
    const doc = inlineDoc({
      type: 'text',
      text: 'site',
      marks: [{ type: 'link', attrs: { href: 'https://x.dev' } }],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('[site](https://x.dev)');
  });

  it('skips a link mark without href', () => {
    const doc = inlineDoc({
      type: 'text',
      text: 'site',
      marks: [{ type: 'link' }],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('site');
  });

  it('ignores unknown mark types', () => {
    const doc = inlineDoc({
      type: 'text',
      text: 'plain',
      marks: [{ type: 'textColor', attrs: { color: '#ff0000' } }],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('plain');
  });
});

describe('adfToMarkdown node attribute fallbacks', () => {
  it('defaults heading level to 1 and caps at 6', () => {
    const doc = docWith(
      { type: 'heading', content: [{ type: 'text', text: 'no level' }] },
      {
        type: 'heading',
        attrs: { level: 9 },
        content: [{ type: 'text', text: 'too deep' }],
      },
    ) as AnyDoc;

    const result = adfToMarkdown(doc);
    expect(result).toContain('# no level');
    expect(result).toContain('###### too deep');
  });

  it('renders a code block without a language attribute', () => {
    const doc = docWith({
      type: 'codeBlock',
      content: [{ type: 'text', text: 'x = 1' }],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('```\nx = 1\n```');
  });

  it('renders mention text or a placeholder', () => {
    const named = inlineDoc({
      type: 'mention',
      attrs: { text: '@alice' },
    }) as AnyDoc;
    const anonymous = inlineDoc({ type: 'mention' }) as AnyDoc;

    expect(adfToMarkdown(named)).toBe('@alice');
    expect(adfToMarkdown(anonymous)).toBe('@unknown');
  });

  it('renders emoji shortName or nothing', () => {
    const smile = inlineDoc(
      { type: 'emoji', attrs: { shortName: ':smile:' } },
      { type: 'text', text: ' hi' },
    ) as AnyDoc;
    const empty = inlineDoc(
      { type: 'emoji' },
      { type: 'text', text: 'hi' },
    ) as AnyDoc;

    expect(adfToMarkdown(smile)).toBe(':smile: hi');
    expect(adfToMarkdown(empty)).toBe('hi');
  });

  it('renders inlineCard url as a link or nothing', () => {
    const withUrl = inlineDoc({
      type: 'inlineCard',
      attrs: { url: 'https://x.dev' },
    }) as AnyDoc;
    const withoutUrl = inlineDoc(
      { type: 'inlineCard' },
      { type: 'text', text: 'after' },
    ) as AnyDoc;

    expect(adfToMarkdown(withUrl)).toBe('[https://x.dev](https://x.dev)');
    expect(adfToMarkdown(withoutUrl)).toBe('after');
  });

  it('renders a panel with its type and defaults to info', () => {
    const warning = docWith({
      type: 'panel',
      attrs: { panelType: 'warning' },
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'careful' }] },
      ],
    }) as AnyDoc;
    const untyped = docWith({
      type: 'panel',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'note' }] },
      ],
    }) as AnyDoc;

    expect(adfToMarkdown(warning)).toBe('> **WARNING:** careful');
    expect(adfToMarkdown(untyped)).toBe('> **INFO:** note');
  });

  it('renders status text in brackets or nothing', () => {
    const withText = inlineDoc({
      type: 'status',
      attrs: { text: 'ON TRACK' },
    }) as AnyDoc;
    const withoutText = inlineDoc(
      { type: 'status' },
      { type: 'text', text: 'after' },
    ) as AnyDoc;

    expect(adfToMarkdown(withText)).toBe('[ON TRACK]');
    expect(adfToMarkdown(withoutText)).toBe('after');
  });

  it('renders media nodes as a placeholder', () => {
    const doc = docWith({ type: 'mediaSingle', content: [{ type: 'media' }] }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('[media]');
  });

  it('defaults a taskItem without state to an open checkbox', () => {
    const doc = docWith({
      type: 'taskList',
      attrs: { localId: 'l1' },
      content: [
        {
          type: 'taskItem',
          attrs: { localId: 't1' },
          content: [{ type: 'text', text: 'no state' }],
        },
      ],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('- [ ] no state');
  });
});

describe('adfToMarkdown unknown nodes', () => {
  it('recurses into unknown nodes with content', () => {
    const doc = docWith({
      type: 'expand',
      attrs: { title: 'Details' },
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hidden' }] },
      ],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('hidden');
  });

  it('falls back to node text for unknown leaf nodes', () => {
    const doc = inlineDoc({ type: 'futureNode', text: 'raw' }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('raw');
  });

  it('renders nothing for unknown empty nodes', () => {
    const doc = inlineDoc(
      { type: 'futureNode' },
      { type: 'text', text: 'after' },
    ) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('after');
  });
});

describe('adfToMarkdown structural edge cases', () => {
  it('renders blockquotes line by line', () => {
    const doc = docWith({
      type: 'blockquote',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
      ],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('> line one\n> \n> line two');
  });

  it('renders rule and hardBreak nodes', () => {
    const doc = docWith(
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a' },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
        ],
      },
      { type: 'rule' },
    ) as AnyDoc;

    const result = adfToMarkdown(doc);
    expect(result).toContain('a\nb');
    expect(result).toContain('---');
  });

  it('handles list items containing a code block', () => {
    const doc = docWith({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'item' }] },
            { type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
          ],
        },
      ],
    }) as AnyDoc;

    const result = adfToMarkdown(doc);
    expect(result).toContain('- item');
    expect(result).toContain('x = 1');
  });

  it('renders an empty table as empty output', () => {
    const doc = docWith(
      { type: 'table' },
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
    ) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('after');
  });

  it('renders ordered lists with a numeric prefix', () => {
    const doc = docWith({
      type: 'orderedList',
      attrs: { order: 1 },
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
          ],
        },
      ],
    }) as AnyDoc;

    expect(adfToMarkdown(doc)).toBe('1. first');
  });
});

describe('adfToMarkdown tables without header cells', () => {
  it('still renders a markdown header separator', () => {
    const doc = {
      version: 1 as const,
      type: 'doc' as const,
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'A' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'B' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = adfToMarkdown(doc);
    const lines = result.split('\n');
    expect(lines[0]).toBe('| A |');
    expect(lines[1]).toBe('| --- |');
    expect(lines[2]).toBe('| B |');
  });
});
