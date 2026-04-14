/**
 * Configuration loader for Jira MCP server.
 *
 * Loads, merges, and validates config.json + credentials.json into a
 * single {@link JiraConfig} object. Supports environment-variable overrides
 * and multi-instance project mappings.
 *
 * Path resolution order:
 *  1. Explicit `options.configPath` / `options.credentialsPath`
 *  2. JIRA_CONFIG_PATH / JIRA_CREDENTIALS_PATH environment variables
 *  3. config.json / credentials.json in `process.cwd()` (if file exists)
 *  4. `~/.softspark/jira-mcp/` global fallback
 *
 * @module
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { pathExists as fileExists } from '../utils/fs.js';

import type {
  JiraConfig,
  JiraInstanceConfig,
  LanguageCode,
  NormalizedCredentials,
  SingleCredentials,
} from './schema.js';
import {
  ConfigFileSchema,
  CredentialsFileSchema,
  SingleCredentialsSchema,
  MultiCredentialsSchema,
  JiraInstanceConfigSchema,
  DEFAULT_LANGUAGE,
} from './schema.js';
import {
  ConfigNotFoundError,
  ConfigValidationError,
} from '../errors/index.js';
import {
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_PATH,
} from './paths.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Options accepted by {@link loadConfig}. */
export interface LoadConfigOptions {
  /** Explicit path to config.json. */
  readonly configPath?: string;
  /** Explicit path to credentials.json. */
  readonly credentialsPath?: string;
}

/** A unique Jira instance (URL + credentials), used for deduplication. */
export interface UniqueInstance {
  readonly url: string;
  readonly username: string;
  readonly api_token: string;
  readonly projectKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

async function resolveConfigPath(options?: LoadConfigOptions): Promise<string> {
  if (options?.configPath) {
    return resolve(options.configPath);
  }

  const envPath = process.env['JIRA_CONFIG_PATH'];
  if (envPath) {
    return resolve(envPath);
  }

  const localPath = resolve(process.cwd(), 'config.json');
  if (await fileExists(localPath)) {
    console.warn(
      `[jira-mcp] WARNING: Loading config.json from working directory (${localPath}) instead of global config. ` +
        'This may be a security risk if running from an untrusted directory.',
    );
    return localPath;
  }

  return GLOBAL_CONFIG_PATH;
}

async function resolveCredentialsPath(
  options?: LoadConfigOptions,
): Promise<string> {
  if (options?.credentialsPath) {
    return resolve(options.credentialsPath);
  }

  const envPath = process.env['JIRA_CREDENTIALS_PATH'];
  if (envPath) {
    return resolve(envPath);
  }

  const localPath = resolve(process.cwd(), 'credentials.json');
  if (await fileExists(localPath)) {
    console.warn(
      `[jira-mcp] WARNING: Loading credentials.json from working directory (${localPath}) instead of global config. ` +
        'This may be a security risk if running from an untrusted directory.',
    );
    return localPath;
  }

  return GLOBAL_CREDENTIALS_PATH;
}

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

async function readJsonFile(filePath: string, label: string): Promise<unknown> {
  if (!(await fileExists(filePath))) {
    throw new ConfigNotFoundError(`${label} not found: ${filePath}`);
  }

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    throw new ConfigNotFoundError(
      `Failed to read ${label}: ${message}`,
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    throw new ConfigValidationError(
      `Invalid JSON in ${label}: ${message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Credential normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a validated credentials file into the internal format.
 *
 * - **Format A** (legacy `{ username, api_token }`): becomes `{ default: ..., instances: {} }`.
 * - **Format B** (`{ default, instances? }`): used as-is with `instances` defaulting to `{}`.
 */
function normalizeCredentials(
  raw: ReturnType<typeof CredentialsFileSchema.parse>,
): NormalizedCredentials {
  // Format A: top-level username means legacy single-credential file.
  const singleResult = SingleCredentialsSchema.safeParse(raw);
  if (singleResult.success && !('default' in (raw as Record<string, unknown>))) {
    return { default: singleResult.data, instances: {} };
  }

  // Format B: multi-credential file.
  const multiResult = MultiCredentialsSchema.safeParse(raw);
  if (multiResult.success) {
    return {
      default: multiResult.data.default,
      instances: multiResult.data.instances ?? {},
    };
  }

  // Should never reach here -- the union schema validated already.
  throw new ConfigValidationError(
    'Credentials file format not recognized. Expected { username, api_token } or { default: { username, api_token }, instances?: {} }.',
  );
}

/**
 * Resolve the credential for a specific Jira instance URL.
 *
 * Looks up `instances[url]` first, then falls back to `default`.
 */
function resolveCredentialForUrl(
  normalized: NormalizedCredentials,
  url: string,
): SingleCredentials {
  return normalized.instances[url] ?? normalized.default;
}

// ---------------------------------------------------------------------------
// Core loader
// ---------------------------------------------------------------------------

/**
 * Load and validate Jira configuration with credentials.
 *
 * Reads config.json and credentials.json, merges credentials into each
 * project entry, and returns the fully-resolved {@link JiraConfig}.
 *
 * @throws {ConfigNotFoundError} If a required file is missing.
 * @throws {ConfigValidationError} If file content fails Zod validation.
 */
export async function loadConfig(
  options?: LoadConfigOptions,
): Promise<JiraConfig> {
  const configPath = await resolveConfigPath(options);
  const credentialsPath = await resolveCredentialsPath(options);

  // Load and validate config.json
  const rawConfig = await readJsonFile(configPath, 'configuration file');
  const configResult = ConfigFileSchema.safeParse(rawConfig);
  if (!configResult.success) {
    throw new ConfigValidationError(
      `Configuration validation failed: ${configResult.error.message}`,
    );
  }
  const config = configResult.data;

  // Load and validate credentials.json (Format A or Format B)
  const rawCreds = await readJsonFile(credentialsPath, 'credentials file');
  const credsResult = CredentialsFileSchema.safeParse(rawCreds);
  if (!credsResult.success) {
    throw new ConfigValidationError(
      `Credentials validation failed: ${credsResult.error.message}`,
    );
  }

  const normalized = normalizeCredentials(credsResult.data);

  // Resolve global language (config file → hardcoded default)
  const globalLanguage: LanguageCode = config.default_language ?? DEFAULT_LANGUAGE;

  // Merge per-instance credentials and language into each project
  const mergedProjects: Record<string, JiraInstanceConfig> = {};
  for (const [key, project] of Object.entries(config.projects)) {
    const cred = resolveCredentialForUrl(normalized, project.url);
    const instance = {
      url: project.url,
      username: cred.username,
      api_token: cred.api_token,
      language: project.language ?? globalLanguage,
    };

    // Validate the merged instance
    const instanceResult = JiraInstanceConfigSchema.safeParse(instance);
    if (!instanceResult.success) {
      throw new ConfigValidationError(
        `Project '${key}' validation failed: ${instanceResult.error.message}`,
      );
    }

    mergedProjects[key] = instanceResult.data;
  }

  return {
    projects: mergedProjects,
    default_project: config.default_project,
    default_language: globalLanguage,
    credentials: normalized.default,
  };
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Get the instance configuration for a specific project.
 *
 * @param config  Fully loaded JiraConfig.
 * @param projectKey  Project key (e.g. "E8A"). Uses default_project when omitted.
 * @returns Tuple of [resolvedProjectKey, instanceConfig].
 * @throws {ConfigValidationError} If the project key is not configured.
 */
export function getProjectConfig(
  config: JiraConfig,
  projectKey?: string,
): readonly [string, JiraInstanceConfig] {
  const key = projectKey ?? config.default_project;
  const instance = config.projects[key];

  if (!instance) {
    throw new ConfigValidationError(
      `Project '${key}' not found in configuration`,
    );
  }

  return [key, instance] as const;
}

/**
 * Return deduplicated Jira instances across all configured projects.
 *
 * Multiple project keys may point to the same Jira URL. This helper
 * groups them so each unique URL is fetched only once during sync.
 */
export function getUniqueInstances(
  config: JiraConfig,
): readonly UniqueInstance[] {
  const byUrl = new Map<string, { readonly keys: string[] }>();

  for (const [key, instance] of Object.entries(config.projects)) {
    const existing = byUrl.get(instance.url);
    if (existing) {
      existing.keys.push(key);
    } else {
      byUrl.set(instance.url, { keys: [key] });
    }
  }

  const result: UniqueInstance[] = [];
  for (const [url, { keys }] of byUrl) {
    // All projects sharing a URL share the same credentials.
    const firstKey = keys[0];
    if (!firstKey) continue;

    const instance = config.projects[firstKey];
    if (!instance) continue;

    result.push({
      url,
      username: instance.username,
      api_token: instance.api_token,
      projectKeys: keys,
    });
  }

  return result;
}
