// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

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

describe('markdownToAdf nested lists', () => {
  it('nests an indented bullet list inside the parent item', () => {
    const result = markdownToAdf('- parent\n  - child 1\n  - child 2\n- sibling');

    const list = result.content.find((n) => n.type === 'bulletList');
    expect(list?.content).toHaveLength(2);

    const parentItem = list?.content?.[0];
    expect(parentItem?.content?.[0]?.type).toBe('paragraph');

    const nested = parentItem?.content?.[1];
    expect(nested?.type).toBe('bulletList');
    expect(nested?.content).toHaveLength(2);
    expect(nested?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('child 1');
  });

  it('nests an ordered list under an unordered item', () => {
    const result = markdownToAdf('- parent\n  1. first\n  2. second');

    const list = result.content.find((n) => n.type === 'bulletList');
    const nested = list?.content?.[0]?.content?.[1];
    expect(nested?.type).toBe('orderedList');
    expect(nested?.content).toHaveLength(2);
  });

  it('handles three nesting levels', () => {
    const result = markdownToAdf('- a\n  - b\n    - c');

    const level1 = result.content.find((n) => n.type === 'bulletList');
    const level2 = level1?.content?.[0]?.content?.[1];
    const level3 = level2?.content?.[0]?.content?.[1];
    expect(level2?.type).toBe('bulletList');
    expect(level3?.type).toBe('bulletList');
    expect(level3?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('c');
  });

  it('starts a sibling list when the kind switches at the same indent', () => {
    const result = markdownToAdf('- bullet\n1. ordered');

    expect(result.content.filter((n) => n.type === 'bulletList')).toHaveLength(1);
    expect(result.content.filter((n) => n.type === 'orderedList')).toHaveLength(1);
  });
});

describe('markdownToAdf task lists', () => {
  it('converts checkboxes into an ADF task list', () => {
    const result = markdownToAdf('- [ ] open item\n- [x] done item');

    const taskList = result.content.find((n) => n.type === 'taskList');
    expect(taskList).toBeDefined();
    expect(taskList?.attrs?.['localId']).toBeDefined();
    expect(taskList?.content).toHaveLength(2);

    const openItem = taskList?.content?.[0];
    const doneItem = taskList?.content?.[1];
    expect(openItem?.type).toBe('taskItem');
    expect(openItem?.attrs?.['state']).toBe('TODO');
    expect(openItem?.content?.[0]?.text).toBe('open item');
    expect(doneItem?.attrs?.['state']).toBe('DONE');
  });

  it('treats uppercase X as done', () => {
    const result = markdownToAdf('- [X] shouted');

    const taskList = result.content.find((n) => n.type === 'taskList');
    expect(taskList?.content?.[0]?.attrs?.['state']).toBe('DONE');
  });

  it('assigns unique localIds to task items', () => {
    const result = markdownToAdf('- [ ] a\n- [ ] b\n- [ ] c');

    const taskList = result.content.find((n) => n.type === 'taskList');
    const ids = (taskList?.content ?? []).map((item) => item.attrs?.['localId']);
    expect(new Set(ids).size).toBe(3);
  });

  it('nests a task list inside a task list', () => {
    const result = markdownToAdf('- [ ] parent\n  - [x] child');

    const taskList = result.content.find((n) => n.type === 'taskList');
    const nested = taskList?.content?.find((n) => n.type === 'taskList');
    expect(nested).toBeDefined();
    expect(nested?.content?.[0]?.attrs?.['state']).toBe('DONE');
  });

  it('lifts bullet children of a task item to siblings after the task list', () => {
    const result = markdownToAdf('- [ ] task\n  - plain bullet');

    const taskList = result.content.find((n) => n.type === 'taskList');
    expect(taskList?.content?.every((n) => n.type !== 'bulletList')).toBe(true);

    const lifted = result.content.find((n) => n.type === 'bulletList');
    expect(lifted).toBeDefined();
  });

  it('keeps plain bullets without checkboxes as a bullet list', () => {
    const result = markdownToAdf('- not a task');

    expect(result.content.find((n) => n.type === 'taskList')).toBeUndefined();
    expect(result.content.find((n) => n.type === 'bulletList')).toBeDefined();
  });
});

describe('markdownToAdf images', () => {
  it('degrades an image to a link without the bang', () => {
    const result = markdownToAdf('See ![diagram](https://example.com/d.png) here');

    const paragraph = result.content.find((n) => n.type === 'paragraph');
    const linkNode = paragraph?.content?.find((n) =>
      n.marks?.some((m) => m.type === 'link'),
    );
    expect(linkNode?.text).toBe('diagram');

    const textBefore = paragraph?.content?.[0];
    expect(textBefore?.text).toBe('See ');
  });

  it('uses the URL as label when alt text is empty', () => {
    const result = markdownToAdf('![](https://example.com/d.png)');

    const paragraph = result.content.find((n) => n.type === 'paragraph');
    const linkNode = paragraph?.content?.find((n) =>
      n.marks?.some((m) => m.type === 'link'),
    );
    expect(linkNode?.text).toBe('https://example.com/d.png');
  });
});

describe('markdownToAdf inline edge cases', () => {
  it('keeps unclosed bold as literal text', () => {
    const result = markdownToAdf('**unclosed');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('**unclosed');
  });

  it('keeps unclosed strikethrough as literal text', () => {
    const result = markdownToAdf('~~unclosed');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('~~unclosed');
  });

  it('keeps an unclosed inline code backtick as literal text', () => {
    const result = markdownToAdf('`unclosed');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('`unclosed');
  });

  it('keeps unclosed italic as literal text', () => {
    const result = markdownToAdf('*unclosed');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('*unclosed');
  });

  it('unescapes backslash-escaped characters', () => {
    const result = markdownToAdf('\\*not italic\\*');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('*not italic*');
  });

  it('skips doubled delimiters when closing a single italic', () => {
    const result = markdownToAdf('*a**b*');
    const nodes = result.content[0]?.content ?? [];
    const hasEm = nodes.some((n) => n.marks?.some((m) => m.type === 'em'));
    expect(hasEm).toBe(true);
  });

  it('treats a bracket without closing paren as literal text', () => {
    const result = markdownToAdf('[text](no-close');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('[text](no-close');
  });

  it('treats a bracket without a following paren as literal text', () => {
    const result = markdownToAdf('[text] plain');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('[text] plain');
  });

  it('treats an unclosed image as literal text', () => {
    const result = markdownToAdf('![alt](no-close');
    const text = result.content[0]?.content?.map((n) => n.text).join('');
    expect(text).toBe('![alt](no-close');
  });

  it('emits hardBreak for a trailing double space', () => {
    const result = markdownToAdf('line one  \nline two');
    const paragraph = result.content[0];
    const hasBreak = paragraph?.content?.some((n) => n.type === 'hardBreak');
    expect(hasBreak).toBe(true);
  });

  it('emits hardBreak for a trailing backslash', () => {
    const result = markdownToAdf('line one\\\nline two');
    const paragraph = result.content[0];
    const hasBreak = paragraph?.content?.some((n) => n.type === 'hardBreak');
    expect(hasBreak).toBe(true);
  });

  it('nests marks for bold inside italic content', () => {
    const result = markdownToAdf('**bold with `code`**');
    const nodes = result.content[0]?.content ?? [];
    const codeNode = nodes.find((n) => n.marks?.some((m) => m.type === 'code'));
    expect(codeNode?.marks?.some((m) => m.type === 'strong')).toBe(true);
  });
});

describe('markdownToAdf block edge cases', () => {
  it('treats seven hashes as a paragraph, not a heading', () => {
    const result = markdownToAdf('####### not a heading');
    expect(result.content[0]?.type).toBe('paragraph');
  });

  it('closes an unterminated code fence at end of input', () => {
    const result = markdownToAdf('```js\nconst x = 1;');
    const codeBlock = result.content.find((n) => n.type === 'codeBlock');
    expect(codeBlock?.content?.[0]?.text).toBe('const x = 1;');
  });

  it('defaults code fence language to text', () => {
    const result = markdownToAdf('```\nplain\n```');
    const codeBlock = result.content.find((n) => n.type === 'codeBlock');
    expect(codeBlock?.attrs?.['language']).toBe('text');
  });

  it('produces an empty code block for an empty fence', () => {
    const result = markdownToAdf('```\n```');
    const codeBlock = result.content.find((n) => n.type === 'codeBlock');
    expect(codeBlock?.content).toHaveLength(0);
  });

  it('produces an empty paragraph for a bare blockquote marker', () => {
    const result = markdownToAdf('>');
    const quote = result.content.find((n) => n.type === 'blockquote');
    expect(quote?.content?.[0]?.type).toBe('paragraph');
  });

  it('parses a list nested inside a blockquote', () => {
    const result = markdownToAdf('> - quoted item');
    const quote = result.content.find((n) => n.type === 'blockquote');
    expect(quote?.content?.[0]?.type).toBe('bulletList');
  });

  it('produces a placeholder space for an empty list item', () => {
    const result = markdownToAdf('- ');
    const list = result.content.find((n) => n.type === 'bulletList');
    const paragraph = list?.content?.[0]?.content?.[0];
    expect(paragraph?.content?.[0]?.text).toBe(' ');
  });

  it('treats tab indentation as nesting', () => {
    const result = markdownToAdf('- parent\n\t- child');
    const list = result.content.find((n) => n.type === 'bulletList');
    expect(list?.content?.[0]?.content?.[1]?.type).toBe('bulletList');
  });

  it('splits a task run from a plain bullet run at the same indent', () => {
    const result = markdownToAdf('- [ ] task\n- plain');
    expect(result.content.find((n) => n.type === 'taskList')).toBeDefined();
    expect(result.content.find((n) => n.type === 'bulletList')).toBeDefined();
  });

  it('interrupts a paragraph when a table starts', () => {
    const result = markdownToAdf('intro line\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(result.content[0]?.type).toBe('paragraph');
    expect(result.content[1]?.type).toBe('table');
  });
});

describe('markdownToAdf table edge cases', () => {
  it('truncates rows wider than the header', () => {
    const result = markdownToAdf('| A | B |\n| --- | --- |\n| 1 | 2 | 3 |');
    const table = result.content.find((n) => n.type === 'table');
    expect(table?.content?.[1]?.content).toHaveLength(2);
  });

  it('pads rows narrower than the header', () => {
    const result = markdownToAdf('| A | B |\n| --- | --- |\n| 1 |');
    const table = result.content.find((n) => n.type === 'table');
    expect(table?.content?.[1]?.content).toHaveLength(2);
  });

  it('keeps escaped pipes inside cells', () => {
    const result = markdownToAdf('| A |\n| --- |\n| 1 \\| 2 |');
    const table = result.content.find((n) => n.type === 'table');
    const cellText =
      table?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text;
    expect(cellText).toBe('1 | 2');
  });

  it('keeps pipes inside inline code spans', () => {
    const result = markdownToAdf('| A |\n| --- |\n| `a|b` |');
    const table = result.content.find((n) => n.type === 'table');
    const cell = table?.content?.[1]?.content?.[0]?.content?.[0];
    const code = cell?.content?.find((n) =>
      n.marks?.some((m) => m.type === 'code'),
    );
    expect(code?.text).toBe('a|b');
  });

  it('does not start a table when delimiter cells mismatch', () => {
    const result = markdownToAdf('| A | B |\n| --- |\nplain');
    expect(result.content.find((n) => n.type === 'table')).toBeUndefined();
  });

  it('stops the table at the first blank line', () => {
    const result = markdownToAdf('| A |\n| --- |\n| 1 |\n\nafter');
    const table = result.content.find((n) => n.type === 'table');
    expect(table?.content).toHaveLength(2);
    expect(result.content.find((n) => n.type === 'paragraph')).toBeDefined();
  });
});

describe('markdown round-trip', () => {
  it('round-trips a task list', () => {
    const adf = markdownToAdf('- [x] done thing\n- [ ] open thing');
    const back = adfToMarkdown(adf);

    expect(back).toContain('- [x] done thing');
    expect(back).toContain('- [ ] open thing');
  });

  it('round-trips a nested bullet list with indentation', () => {
    const adf = markdownToAdf('- parent\n  - child');
    const back = adfToMarkdown(adf);

    expect(back).toContain('- parent');
    expect(back).toContain('  - child');
  });
});
