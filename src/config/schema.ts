/**
 * Zod schemas for Jira MCP configuration files.
 *
 * Covers three file shapes:
 *  1. config.json  -- projects + default_project
 *  2. credentials.json  -- username + api_token
 *  3. Merged JiraConfig  -- projects enriched with credentials
 *
 * All TypeScript types are derived from the schemas via `z.infer<>`.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/** Supported language codes for task content (summaries, descriptions). */
export const SUPPORTED_LANGUAGES = ['pl', 'en', 'de', 'es', 'fr', 'pt', 'it', 'nl'] as const;

export const LanguageCodeSchema = z.enum(SUPPORTED_LANGUAGES);

export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const DEFAULT_LANGUAGE: LanguageCode = 'pl';

// ---------------------------------------------------------------------------
// config.json schemas
// ---------------------------------------------------------------------------

/** Schema for a single project entry inside config.json. */
export const ProjectConfigSchema = z.object({
  url: z.string().url(),
  language: LanguageCodeSchema.optional(),
});

/** Schema for the entire config.json file. */
export const ConfigFileSchema = z
  .object({
    projects: z.record(z.string(), ProjectConfigSchema),
    default_project: z.string(),
    default_language: LanguageCodeSchema.optional(),
  })
  .refine((c) => c.default_project in c.projects, {
    message: 'default_project must reference a configured project',
  });

// ---------------------------------------------------------------------------
// credentials.json schemas
// ---------------------------------------------------------------------------

/** Schema for a single credential pair (username + API token). */
export const SingleCredentialsSchema = z.object({
  username: z.string().email(),
  api_token: z.string().min(1),
});

/** Schema for per-instance credentials with a default fallback. */
export const MultiCredentialsSchema = z.object({
  default: SingleCredentialsSchema,
  instances: z.record(z.string().url(), SingleCredentialsSchema).optional(),
});

/**
 * Union schema for credentials.json.
 *
 * Accepts two formats:
 *  - **Format A** (legacy): `{ username, api_token }` -- single credential for all instances.
 *  - **Format B** (new):    `{ default, instances? }` -- per-instance credentials with fallback.
 */
export const CredentialsFileSchema = z.union([
  SingleCredentialsSchema,
  MultiCredentialsSchema,
]);

// ---------------------------------------------------------------------------
// Merged / runtime schemas
// ---------------------------------------------------------------------------

/** Schema for a fully-resolved Jira instance (project URL + credentials). */
export const JiraInstanceConfigSchema = z.object({
  url: z.string().url(),
  username: z.string().email(),
  api_token: z.string().min(1),
  language: LanguageCodeSchema,
});

/** Schema for the complete, merged configuration used at runtime. */
export const JiraConfigSchema = z.object({
  projects: z.record(z.string(), JiraInstanceConfigSchema),
  default_project: z.string(),
  default_language: LanguageCodeSchema,
  credentials: SingleCredentialsSchema,
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export type SingleCredentials = z.infer<typeof SingleCredentialsSchema>;
export type MultiCredentials = z.infer<typeof MultiCredentialsSchema>;
export type CredentialsFile = z.infer<typeof CredentialsFileSchema>;

/**
 * Normalized internal credential store.
 *
 * Regardless of the file format (A or B), the loader converts credentials
 * into this shape before merging into projects.
 */
export interface NormalizedCredentials {
  readonly default: SingleCredentials;
  readonly instances: Readonly<Record<string, SingleCredentials>>;
}

/** @deprecated Use {@link CredentialsFile} instead. Kept for backward compatibility. */
export type CredentialsConfig = SingleCredentials;
export type JiraInstanceConfig = z.infer<typeof JiraInstanceConfigSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
