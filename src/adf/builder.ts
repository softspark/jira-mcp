/**
 * Pure helper functions for constructing ADF nodes and documents.
 *
 * Every function returns a fresh, immutable-by-convention object.
 * No side effects, no library dependencies.
 */

import type { AdfDocument, AdfMark, AdfNode } from './types.js';

/**
 * Create an empty ADF document containing a single empty paragraph.
 *
 * Jira requires at least one block node inside a document, so we include
 * an empty paragraph rather than an empty `content` array.
 */
export function createEmptyDoc(): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [] }],
  };
}

/**
 * Create a minimal ADF document wrapping plain text in a paragraph.
 */
export function createTextDoc(text: string): AdfDocument {
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

/**
 * Wrap an existing ADF document's content inside a panel node.
 *
 * Returns a new document -- the original is not mutated.
 */
export function wrapInPanel(
  doc: AdfDocument,
  panelType: 'info' | 'note' | 'warning' | 'success' | 'error',
): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'panel',
        attrs: { panelType },
        content: [...doc.content],
      },
    ],
  };
}

/**
 * Create an ADF heading node at the specified level.
 */
export function createHeading(
  text: string,
  level: 1 | 2 | 3 | 4 | 5 | 6,
): AdfNode {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

/**
 * Create an ADF paragraph node with optional inline marks.
 */
export function createParagraph(
  text: string,
  marks?: readonly AdfMark[],
): AdfNode {
  const textNode: AdfNode =
    marks && marks.length > 0
      ? { type: 'text', text, marks: [...marks] }
      : { type: 'text', text };

  return {
    type: 'paragraph',
    content: [textNode],
  };
}
