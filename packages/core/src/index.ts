// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Public API of the shared Atlassian MCP core.
 *
 * This package is never published. It exists so `jira-mcp` and
 * `confluence-mcp` share one copy of the things a single Atlassian Cloud
 * site forces them to agree on: the config file on disk, the credentials in
 * it, the ADF documents both products exchange, the HTTP transport, and the
 * MCP response envelope.
 *
 * Each server bundles what it uses at build time, so nothing here reaches a
 * consumer as a separate dependency.
 *
 * @module
 */

// --- Configuration -------------------------------------------------------
export {
  loadConfig,
  loadConfluenceConfig,
  getProjectConfig,
  getSpaceConfig,
  getUniqueInstances,
} from './config/loader.js';
export type { LoadConfigOptions, UniqueInstance } from './config/loader.js';
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  BODY_FORMATS,
  DEFAULT_BODY_FORMAT,
  BodyFormatSchema,
  LanguageCodeSchema,
  ProjectConfigSchema,
  SpaceConfigSchema,
  ConfigFileSchema,
  SingleCredentialsSchema,
  MultiCredentialsSchema,
  CredentialsFileSchema,
  JiraInstanceConfigSchema,
  JiraConfigSchema,
  ConfluenceSpaceInstanceConfigSchema,
  ConfluenceConfigSchema,
} from './config/schema.js';
export type {
  LanguageCode,
  BodyFormat,
  ProjectConfig,
  SpaceConfig,
  ConfigFile,
  SingleCredentials,
  MultiCredentials,
  CredentialsFile,
  CredentialsConfig,
  NormalizedCredentials,
  JiraInstanceConfig,
  JiraConfig,
  ConfluenceSpaceInstanceConfig,
  ConfluenceConfig,
} from './config/schema.js';
export {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
  GLOBAL_CACHE_DIR,
  GLOBAL_STATE_PATH,
} from './config/paths.js';

// --- Errors --------------------------------------------------------------
export * from './errors/index.js';

// --- ADF -----------------------------------------------------------------
export { markdownToAdf } from './adf/markdown-to-adf.js';
export { adfToMarkdown } from './adf/adf-to-markdown.js';
export {
  createEmptyDoc,
  createTextDoc,
  wrapInPanel,
  createHeading,
  createParagraph,
} from './adf/builder.js';
export { AdfDocumentSchema } from './adf/schema.js';
export type { AdfDocument, AdfNode, AdfMark } from './adf/types.js';

// --- HTTP ----------------------------------------------------------------
export { AtlassianHttpClient } from './http/atlassian-client.js';
export type {
  AtlassianSiteConfig,
  HttpErrorMapper,
  HttpFailure,
  RetryPolicy,
} from './http/atlassian-client.js';

// --- MCP tool plumbing ---------------------------------------------------
export { success, failure } from './tools/results.js';
export type { ToolResult, ToolDefinition } from './tools/results.js';
export {
  asOptionalBoolean,
  asOptionalNumber,
  asOptionalRecord,
  asOptionalString,
  asOptionalStringArray,
  requireString,
} from './tools/args.js';
export { assertCommentApproved } from './tools/comment-approval.js';
export { assertDeletionApproved } from './tools/deletion-approval.js';

// --- Template rendering --------------------------------------------------
export { renderTemplate } from './templates/renderer.js';
export type {
  RenderableTemplate,
  TemplateVariable,
  RenderResult,
  RenderError,
  TemplateRenderOutput,
} from './templates/renderer.js';

// --- CLI + filesystem ----------------------------------------------------
export { info, warn, error, table } from './cli/output.js';
export {
  pathExists,
  writeSecureFile,
  loadJsonFile,
  saveJsonFile,
} from './utils/fs.js';
