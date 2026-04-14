/**
 * Zod schemas for validating bulk task configuration JSON files.
 *
 * These schemas mirror the interfaces in `types.ts` and apply sensible
 * defaults so that callers need only provide the minimal required fields.
 */

import { z } from 'zod';

import { LanguageCodeSchema, DEFAULT_LANGUAGE } from '../config/schema.js';

/** Schema for a single task within a bulk configuration. */
export const TaskConfigSchema = z
  .object({
    summary: z.string().min(1, 'Summary is required').max(255),
    description: z.string().optional().default(''),
    type: z.string().default('Task'),
    assignee: z.string().email('Invalid assignee email format').optional(),
    priority: z
      .enum(['Highest', 'High', 'Medium', 'Low', 'Lowest'])
      .default('Medium'),
    labels: z.array(z.string()).default([]),
    estimate_hours: z.number().positive('Estimate must be positive').optional(),
    status: z.string().optional(),
  })
  // Allow localized fields: summary_en, summary_de, description_fr, etc.
  .catchall(z.string().optional());

/** Schema for bulk operation options with safe defaults. */
export const BulkOptionsSchema = z.object({
  dry_run: z.boolean().default(true),
  update_existing: z.boolean().default(false),
  match_field: z.string().default('summary'),
  rate_limit_ms: z.number().int().min(0).default(500),
  force_reassign: z.boolean().default(false),
  reassign_delay_ms: z.number().int().min(0).default(0),
  language: LanguageCodeSchema.default(DEFAULT_LANGUAGE),
});

/** Schema for the complete bulk configuration file. */
export const BulkConfigSchema = z.object({
  epic_key: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9]*-\d+$/,
      'Invalid epic key format (e.g., PROJ-123)',
    ),
  tasks: z
    .array(TaskConfigSchema)
    .min(1, 'At least one task is required'),
  options: BulkOptionsSchema.default({}),
});

/** Inferred type after parsing through BulkConfigSchema. */
export type ParsedBulkConfig = z.infer<typeof BulkConfigSchema>;
