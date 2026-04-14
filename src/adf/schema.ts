/**
 * Zod validation schemas for ADF documents.
 *
 * Use these at API boundaries to validate ADF payloads received from Jira
 * before passing them through the conversion pipeline.
 */

import { z } from 'zod';

const AdfMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const AdfNodeSchema: z.ZodType = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(AdfNodeSchema).optional(),
    marks: z.array(AdfMarkSchema).optional(),
    text: z.string().optional(),
  }),
);

export const AdfDocumentSchema = z.object({
  version: z.literal(1),
  type: z.literal('doc'),
  content: z.array(AdfNodeSchema).min(1),
});
