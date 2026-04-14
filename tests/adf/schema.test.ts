/**
 * Tests for ADF Zod validation schemas.
 */

import { describe, it, expect } from 'vitest';

import { AdfDocumentSchema } from '../../src/adf/schema';
import { createSimpleAdfDoc, createAdfWithHeading } from '../fixtures/adf';

describe('AdfDocumentSchema', () => {
  it('accepts a valid simple ADF document', () => {
    const result = AdfDocumentSchema.safeParse(createSimpleAdfDoc());
    expect(result.success).toBe(true);
  });

  it('accepts a document with heading and paragraph', () => {
    const result = AdfDocumentSchema.safeParse(
      createAdfWithHeading('Title', 'Body text'),
    );
    expect(result.success).toBe(true);
  });

  it('rejects document with missing version', () => {
    const result = AdfDocumentSchema.safeParse({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects document with wrong version', () => {
    const result = AdfDocumentSchema.safeParse({
      version: 2,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects document with wrong type', () => {
    const result = AdfDocumentSchema.safeParse({
      version: 1,
      type: 'paragraph',
      content: [{ type: 'text', text: 'hi' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects document with empty content array', () => {
    const result = AdfDocumentSchema.safeParse({
      version: 1,
      type: 'doc',
      content: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts nested content nodes', () => {
    const result = AdfDocumentSchema.safeParse({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'item' }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts nodes with marks', () => {
    const result = AdfDocumentSchema.safeParse({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold',
              marks: [{ type: 'strong' }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
