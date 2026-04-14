/**
 * Type definitions for bulk task creation operations.
 *
 * Ported from the Python MVP TypedDicts to strict TypeScript interfaces.
 * All properties are readonly to enforce immutability at the type level.
 */

import type { LanguageCode } from '../config/schema.js';

/**
 * Configuration for a single Jira task to create or update.
 *
 * At minimum, `summary` is required. All other fields have sensible defaults
 * applied during schema validation.
 */
export interface TaskConfig {
  readonly summary: string;
  readonly description?: string;
  /** Localized summary variants keyed by language suffix (e.g. summary_en, summary_de). */
  readonly [key: `summary_${string}`]: string | undefined;
  /** Localized description variants keyed by language suffix (e.g. description_en, description_de). */
  readonly [key: `description_${string}`]: string | undefined;
  /** Issue type (default: "Task"). */
  readonly type?: string;
  /** Assignee email address. */
  readonly assignee?: string;
  /** Priority level (default: "Medium"). */
  readonly priority?: string;
  readonly labels?: readonly string[];
  /** Time estimate in hours. */
  readonly estimate_hours?: number;
  /** Initial status to transition to after creation. */
  readonly status?: string;
}

/**
 * Options controlling bulk operation behaviour.
 *
 * Defaults are applied by the Zod schema so callers may omit any field.
 */
export interface BulkOptions {
  /** Preview without making changes (default: true). */
  readonly dry_run: boolean;
  /** Update task if it already exists (default: false). */
  readonly update_existing: boolean;
  /** Field used to detect existing tasks (default: "summary"). */
  readonly match_field: string;
  /** Milliseconds to wait between API calls (default: 500). */
  readonly rate_limit_ms: number;
  /** Re-assign after creation to override Jira automation (default: false). */
  readonly force_reassign: boolean;
  /** Milliseconds to wait before re-assigning (default: 0). */
  readonly reassign_delay_ms: number;
  /** Language for summary/description selection (default: "pl"). */
  readonly language: LanguageCode;
}

/** Possible outcomes for a single task operation. */
export type TaskAction = 'created' | 'updated' | 'failed' | 'skipped' | 'preview';

/** Result of processing a single task. */
export interface TaskResult {
  readonly summary: string;
  readonly issue_key: string | null;
  readonly action: TaskAction;
  readonly error: string | null;
  readonly url: string | null;
}

/**
 * Complete bulk operation configuration.
 *
 * Combines the target epic, task list, and operation options.
 */
export interface BulkConfig {
  /** Epic issue key (e.g., "PROJ-123"). */
  readonly epic_key: string;
  readonly tasks: readonly TaskConfig[];
  readonly options: BulkOptions;
}

/** Aggregate result of a bulk operation. */
export interface BulkResult {
  readonly results: readonly TaskResult[];
  readonly summary: {
    readonly created: number;
    readonly updated: number;
    readonly failed: number;
    readonly skipped: number;
    readonly previewed: number;
  };
  readonly dry_run: boolean;
  readonly total_time_ms: number;
}
