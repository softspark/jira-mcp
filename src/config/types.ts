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
