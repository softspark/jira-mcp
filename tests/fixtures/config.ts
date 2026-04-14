/**
 * Factory functions for configuration test data.
 */

import type {
  JiraConfig,
  JiraInstanceConfig,
  SingleCredentials,
  MultiCredentials,
} from '../../src/config/schema';

export function createProjectConfig(
  url = 'https://test.atlassian.net',
): { url: string } {
  return { url };
}

export function createConfigFile(projectCount = 1): {
  projects: Record<string, { url: string }>;
  default_project: string;
} {
  const projects: Record<string, { url: string }> = {};
  let firstKey = '';

  for (let i = 0; i < projectCount; i++) {
    const key = `PROJ${i}`;
    projects[key] = createProjectConfig(
      `https://instance${i}.atlassian.net`,
    );
    if (i === 0) firstKey = key;
  }

  return {
    projects,
    default_project: firstKey,
  };
}

/** Create a single (Format A) credential object. */
export function createCredentials(
  username = 'user@example.com',
  apiToken = 'test-api-token-123',
): SingleCredentials {
  return { username, api_token: apiToken };
}

/** Create a multi-instance (Format B) credential object. */
export function createMultiCredentials(overrides?: {
  readonly default?: SingleCredentials;
  readonly instances?: Record<string, SingleCredentials>;
}): MultiCredentials {
  return {
    default: overrides?.default ?? createCredentials(),
    instances: overrides?.instances,
  };
}

export function createInstanceConfig(
  overrides?: Partial<JiraInstanceConfig>,
): JiraInstanceConfig {
  return {
    url: 'https://test.atlassian.net',
    username: 'user@example.com',
    api_token: 'test-api-token-123',
    language: 'pl',
    ...overrides,
  };
}

export function createMergedConfig(
  overrides?: Partial<JiraConfig>,
): JiraConfig {
  return {
    projects: {
      PROJ0: createInstanceConfig(),
    },
    default_project: 'PROJ0',
    default_language: 'pl',
    credentials: createCredentials(),
    ...overrides,
  };
}
