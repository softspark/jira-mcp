// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Re-exported configuration types.
 *
 * Consumers that only need types (not schemas) should import from here
 * to avoid pulling in the Zod runtime.
 */

export type {
  JiraConfig,
  ProjectConfig,
  CredentialsConfig,
  JiraInstanceConfig,
  ConfigFile,
  SingleCredentials,
  MultiCredentials,
  CredentialsFile,
  NormalizedCredentials,
} from './schema.js';
