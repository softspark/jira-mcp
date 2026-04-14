/**
 * Factory functions for ADF test data.
 */

import type { AdfDocument, AdfNode } from '../../src/adf/types';

export function createSimpleAdfDoc(text = 'Hello world'): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export function createAdfWithHeading(
  heading: string,
  body: string,
): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: heading }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: body }],
      },
    ],
  };
}

export function createAdfWithMarks(
  text: string,
  markType: 'strong' | 'em' | 'code',
): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text,
            marks: [{ type: markType }],
          },
        ],
      },
    ],
  };
}

export function createAdfCodeBlock(
  code: string,
  language = 'typescript',
): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: code }],
      },
    ],
  };
}

export function createEmptyAdfContent(): AdfNode {
  return { type: 'paragraph', content: [] };
}
