// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Zod schemas for Jira MCP configuration files.
 *
 * Covers four file shapes:
 *  1. config.json  -- projects + default_project (+ optional spaces for Confluence)
 *  2. credentials.json  -- username + api_token
 *  3. Merged JiraConfig  -- projects enriched with credentials
 *  4. Merged ConfluenceConfig  -- spaces enriched with the same credentials
 *
 * Jira and Confluence share one config.json and one credentials.json because a
 * single Atlassian Cloud site serves both products from the same host and the
 * same API token. `projects` routes Jira, `spaces` routes Confluence.
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

// ---------------------------------------------------------------------------
// Confluence body format
// ---------------------------------------------------------------------------

/**
 * How page bodies are exchanged with a Confluence space.
 *
 * - `markdown` -- bodies are markdown, converted to and from ADF. Readable and
 *   easy for an assistant to author, but it cannot express Confluence macros,
 *   page links or attachment references.
 * - `storage` -- bodies are Confluence's own XHTML. Everything the editor can
 *   produce survives a round-trip, at the cost of being harder to write.
 *
 * A space whose pages were authored anywhere other than this tool is almost
 * certainly `storage`: panels, tables of contents and page links are all
 * storage-only markup, and writing markdown over them deletes them.
 */
export const BODY_FORMATS = ['markdown', 'storage'] as const;

export const BodyFormatSchema = z.enum(BODY_FORMATS);

export type BodyFormat = z.infer<typeof BodyFormatSchema>;

/** Format assumed when neither the space nor the config file states one. */
export const DEFAULT_BODY_FORMAT: BodyFormat = 'markdown';

/**
 * Schema for a single Confluence space entry inside config.json.
 *
 * Shape mirrors {@link ProjectConfigSchema}: the space key routes to a site
 * URL, and the optional language and format override the global defaults for
 * content written into that space.
 */
export const SpaceConfigSchema = z.object({
  url: z.string().url(),
  language: LanguageCodeSchema.optional(),
  format: BodyFormatSchema.optional(),
});

/** Schema for the entire config.json file. */
export const ConfigFileSchema = z
  .object({
    projects: z.record(z.string(), ProjectConfigSchema),
    default_project: z.string(),
    default_language: LanguageCodeSchema.optional(),
    spaces: z.record(z.string(), SpaceConfigSchema).optional(),
    default_space: z.string().optional(),
    default_format: BodyFormatSchema.optional(),
  })
  .refine((c) => c.default_project in c.projects, {
    message: 'default_project must reference a configured project',
  })
  .refine(
    (c) => c.default_space === undefined || c.default_space in (c.spaces ?? {}),
    { message: 'default_space must reference a configured space' },
  );

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

/** Schema for a fully-resolved Confluence space (site URL + credentials). */
export const ConfluenceSpaceInstanceConfigSchema = z.object({
  url: z.string().url(),
  username: z.string().email(),
  api_token: z.string().min(1),
  language: LanguageCodeSchema,
  format: BodyFormatSchema,
});

/**
 * Schema for the merged Confluence configuration used at runtime.
 *
 * `default_space` stays optional: a site may have exactly one configured
 * space, in which case every tool call can omit `space_key`.
 */
export const ConfluenceConfigSchema = z.object({
  spaces: z.record(z.string(), ConfluenceSpaceInstanceConfigSchema),
  default_space: z.string().optional(),
  default_language: LanguageCodeSchema,
  default_format: BodyFormatSchema,
  credentials: SingleCredentialsSchema,
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type SpaceConfig = z.infer<typeof SpaceConfigSchema>;
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
export type ConfluenceSpaceInstanceConfig = z.infer<
  typeof ConfluenceSpaceInstanceConfigSchema
>;
export type ConfluenceConfig = z.infer<typeof ConfluenceConfigSchema>;
