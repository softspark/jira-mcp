/**
 * Configuration module public API.
 */

export { loadConfig, getProjectConfig, getUniqueInstances } from './loader.js';
export type { LoadConfigOptions, UniqueInstance } from './loader.js';
export type {
  JiraConfig,
  ProjectConfig,
  CredentialsConfig,
  JiraInstanceConfig,
  ConfigFile,
} from './types.js';
export {
  ProjectConfigSchema,
  ConfigFileSchema,
  CredentialsFileSchema,
  JiraInstanceConfigSchema,
  JiraConfigSchema,
} from './schema.js';
export {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
  GLOBAL_CACHE_DIR,
  GLOBAL_WORKFLOWS_PATH,
  GLOBAL_USERS_PATH,
  GLOBAL_STATE_PATH,
  GLOBAL_TEMPLATES_DIR,
  GLOBAL_TASK_TEMPLATES_DIR,
  ensureGlobalDirs,
} from './paths.js';
