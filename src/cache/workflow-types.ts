/**
 * Zod schemas and inferred types for the workflow cache.
 *
 * The workflow cache stores valid statuses per issue type per project,
 * along with transition metadata populated on first query.
 *
 * On-disk format:
 *   { last_sync, projects: { [projectKey]: { issue_types: { ... } } } }
 *
 * @module
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** Schema for a single workflow transition. */
export const WorkflowTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/** Schema for an issue type's workflow within a project. */
export const IssueTypeWorkflowSchema = z.object({
  statuses: z.array(z.string()),
  transitions: z.record(z.string(), z.array(WorkflowTransitionSchema)),
});

/** Schema for a project's complete workflow configuration. */
export const ProjectWorkflowSchema = z.object({
  issue_types: z.record(z.string(), IssueTypeWorkflowSchema),
});

/** Schema for the entire workflow cache file. */
export const WorkflowCacheDataSchema = z.object({
  last_sync: z.string(),
  projects: z.record(z.string(), ProjectWorkflowSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
export type IssueTypeWorkflow = z.infer<typeof IssueTypeWorkflowSchema>;
export type ProjectWorkflow = z.infer<typeof ProjectWorkflowSchema>;
export type WorkflowCacheData = z.infer<typeof WorkflowCacheDataSchema>;
