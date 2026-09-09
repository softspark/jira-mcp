// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Configuration module public API.
 */

export {
  loadConfig,
  loadConfluenceConfig,
  getProjectConfig,
  getSpaceConfig,
  getUniqueInstances,
} from './loader.js';
export type { LoadConfigOptions, UniqueInstance } from './loader.js';
export type {
  JiraConfig,
  ProjectConfig,
  CredentialsConfig,
  JiraInstanceConfig,
  ConfigFile,
  SpaceConfig,
  ConfluenceConfig,
  ConfluenceSpaceInstanceConfig,
} from './types.js';
export {
  ProjectConfigSchema,
  SpaceConfigSchema,
  ConfigFileSchema,
  CredentialsFileSchema,
  JiraInstanceConfigSchema,
  JiraConfigSchema,
  ConfluenceSpaceInstanceConfigSchema,
  ConfluenceConfigSchema,
} from './schema.js';
export {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
  GLOBAL_CACHE_DIR,
  GLOBAL_STATE_PATH,
} from './paths.js';
