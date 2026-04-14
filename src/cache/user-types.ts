/**
 * Zod schemas and inferred types for the user cache.
 *
 * The user cache stores Jira users per instance for offline lookups
 * (e.g. resolving email to accountId without hitting the API).
 *
 * On-disk format:
 *   { last_sync, instances: { [instanceUrl]: { users: [...] } } }
 *
 * @module
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Schema for a single cached Jira user. */
export const CachedUserSchema = z.object({
  account_id: z.string(),
  email: z.string().nullable(),
  display_name: z.string(),
  active: z.boolean(),
});

/** Schema for all users belonging to a single Jira instance. */
export const InstanceUsersSchema = z.object({
  users: z.array(CachedUserSchema),
});

/** Schema for the entire user cache file. */
export const UserCacheDataSchema = z.object({
  last_sync: z.string(),
  instances: z.record(z.string(), InstanceUsersSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CachedUser = z.infer<typeof CachedUserSchema>;
export type InstanceUsers = z.infer<typeof InstanceUsersSchema>;
export type UserCacheData = z.infer<typeof UserCacheDataSchema>;
