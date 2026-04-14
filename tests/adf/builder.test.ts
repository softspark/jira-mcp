/**
 * Tests for ADF builder helper functions.
 */

import { describe, it, expect } from 'vitest';

import {
  createEmptyDoc,
  createTextDoc,
  wrapInPanel,
  createHeading,
  createParagraph,
} from '../../src/adf/builder';
import type { AdfMark } from '../../src/adf/types';

describe('createEmptyDoc', () => {
  it('returns valid ADF document with version 1', () => {
    const doc = createEmptyDoc();
    expect(doc.version).toBe(1);
    expect(doc.type).toBe('doc');
  });

  it('contains single empty paragraph', () => {
    const doc = createEmptyDoc();
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe('paragraph');
    expect(doc.content[0]?.content).toEqual([]);
  });
});

describe('createTextDoc', () => {
  it('wraps text in a paragraph inside a doc', () => {
    const doc = createTextDoc('Hello');
    expect(doc.version).toBe(1);
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);

    const paragraph = doc.content[0];
    expect(paragraph?.type).toBe('paragraph');
    expect(paragraph?.content).toHaveLength(1);
    expect(paragraph?.content?.[0]?.type).toBe('text');
    expect(paragraph?.content?.[0]?.text).toBe('Hello');
  });

  it('preserves special characters in text', () => {
    const doc = createTextDoc('Hello <world> & "friends"');
    expect(doc.content[0]?.content?.[0]?.text).toBe(
      'Hello <world> & "friends"',
    );
  });
});

describe('wrapInPanel', () => {
  it('wraps document content in a panel node', () => {
    const original = createTextDoc('Some text');
    const wrapped = wrapInPanel(original, 'info');

    expect(wrapped.version).toBe(1);
    expect(wrapped.type).toBe('doc');
    expect(wrapped.content).toHaveLength(1);

    const panel = wrapped.content[0];
    expect(panel?.type).toBe('panel');
    expect(panel?.attrs).toEqual({ panelType: 'info' });
    // Panel should contain the original content
    expect(panel?.content).toHaveLength(1);
    expect(panel?.content?.[0]?.type).toBe('paragraph');
  });

  it('does not mutate the original document', () => {
    const original = createTextDoc('Immutable');
    const wrapped = wrapInPanel(original, 'warning');

    expect(original.content[0]?.type).toBe('paragraph');
    expect(wrapped.content[0]?.type).toBe('panel');
  });

  it('supports all panel types', () => {
    const panelTypes = [
      'info',
      'note',
      'warning',
      'success',
      'error',
    ] as const;

    for (const panelType of panelTypes) {
      const wrapped = wrapInPanel(createEmptyDoc(), panelType);
      expect(wrapped.content[0]?.attrs).toEqual({ panelType });
    }
  });
});

describe('createHeading', () => {
  it('creates heading node with text and level', () => {
    const heading = createHeading('My Title', 1);

    expect(heading.type).toBe('heading');
    expect(heading.attrs).toEqual({ level: 1 });
    expect(heading.content).toHaveLength(1);
    expect(heading.content?.[0]?.text).toBe('My Title');
  });

  it('supports all heading levels 1-6', () => {
    const levels = [1, 2, 3, 4, 5, 6] as const;

    for (const level of levels) {
      const heading = createHeading(`Level ${level}`, level);
      expect(heading.attrs).toEqual({ level });
    }
  });
});

describe('createParagraph', () => {
  it('creates paragraph node with plain text', () => {
    const para = createParagraph('Hello');

    expect(para.type).toBe('paragraph');
    expect(para.content).toHaveLength(1);
    expect(para.content?.[0]?.type).toBe('text');
    expect(para.content?.[0]?.text).toBe('Hello');
    expect(para.content?.[0]?.marks).toBeUndefined();
  });

  it('creates paragraph with marks when provided', () => {
    const marks: AdfMark[] = [{ type: 'strong' }];
    const para = createParagraph('Bold text', marks);

    expect(para.content?.[0]?.marks).toHaveLength(1);
    expect(para.content?.[0]?.marks?.[0]?.type).toBe('strong');
  });

  it('omits marks property when marks array is empty', () => {
    const para = createParagraph('No marks', []);

    expect(para.content?.[0]?.marks).toBeUndefined();
  });
});
