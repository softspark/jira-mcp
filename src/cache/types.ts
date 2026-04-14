/**
 * Zod schemas and inferred types for the task cache.
 *
 * The cache file is a JSON document with:
 *  - `metadata` -- schema version, last sync timestamp, owning user
 *  - `tasks`    -- array of TaskData objects
 *
 * @module
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current cache schema version. Bump when the on-disk format changes. */
export const CACHE_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Schema for a single cached Jira task. */
export const TaskDataSchema = z.object({
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  assignee: z.string().nullable(),
  priority: z.string(),
  issue_type: z.string(),
  created: z.string(),
  updated: z.string(),
  project_key: z.string(),
  project_url: z.string().url(),
  epic_link: z.string().nullable(),
});

/** Schema for cache metadata. */
export const CacheMetadataSchema = z.object({
  version: z.string(),
  last_sync: z.string(),
  jira_user: z.string(),
});

/** Schema for the complete cache file. */
export const CacheDataSchema = z.object({
  metadata: CacheMetadataSchema,
  tasks: z.array(TaskDataSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type TaskData = z.infer<typeof TaskDataSchema>;
export type CacheMetadata = z.infer<typeof CacheMetadataSchema>;
export type CacheData = z.infer<typeof CacheDataSchema>;
