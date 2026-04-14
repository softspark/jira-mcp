/**
 * Tests for config Zod schemas.
 */

import { describe, it, expect } from 'vitest';

import {
  ProjectConfigSchema,
  ConfigFileSchema,
  CredentialsFileSchema,
  SingleCredentialsSchema,
  MultiCredentialsSchema,
  JiraInstanceConfigSchema,
  JiraConfigSchema,
} from '../../src/config/schema';
import {
  createProjectConfig,
  createConfigFile,
  createCredentials,
  createMultiCredentials,
  createInstanceConfig,
  createMergedConfig,
} from '../fixtures/config';

describe('ProjectConfigSchema', () => {
  it('accepts valid project config with URL', () => {
    const result = ProjectConfigSchema.safeParse(
      createProjectConfig('https://test.atlassian.net'),
    );
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = ProjectConfigSchema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects missing URL', () => {
    const result = ProjectConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('ConfigFileSchema', () => {
  it('accepts valid config.json structure', () => {
    const result = ConfigFileSchema.safeParse(createConfigFile(2));
    expect(result.success).toBe(true);
  });

  it('rejects missing projects field', () => {
    const result = ConfigFileSchema.safeParse({
      default_project: 'PROJ0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty projects object', () => {
    const result = ConfigFileSchema.safeParse({
      projects: {},
      default_project: 'PROJ0',
    });
    // Refinement: default_project must reference a configured project
    expect(result.success).toBe(false);
  });

  it('rejects default_project not in projects', () => {
    const config = createConfigFile(1);
    config.default_project = 'NONEXISTENT';
    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects missing default_project field', () => {
    const result = ConfigFileSchema.safeParse({
      projects: { PROJ0: { url: 'https://test.atlassian.net' } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts multiple projects with valid default', () => {
    const config = createConfigFile(3);
    const result = ConfigFileSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('SingleCredentialsSchema', () => {
  it('accepts valid single credentials', () => {
    const result = SingleCredentialsSchema.safeParse(createCredentials());
    expect(result.success).toBe(true);
  });

  it('rejects non-email username', () => {
    const result = SingleCredentialsSchema.safeParse({
      username: 'not-an-email',
      api_token: 'token123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty api_token', () => {
    const result = SingleCredentialsSchema.safeParse({
      username: 'user@example.com',
      api_token: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('MultiCredentialsSchema', () => {
  it('accepts valid multi-credentials with instances', () => {
    const result = MultiCredentialsSchema.safeParse(
      createMultiCredentials({
        instances: {
          'https://other.atlassian.net': createCredentials(
            'other@example.com',
            'other-token',
          ),
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts multi-credentials without instances (default only)', () => {
    const result = MultiCredentialsSchema.safeParse(
      createMultiCredentials(),
    );
    expect(result.success).toBe(true);
  });

  it('rejects invalid default credential', () => {
    const result = MultiCredentialsSchema.safeParse({
      default: { username: 'bad', api_token: '' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid instance URL key', () => {
    const result = MultiCredentialsSchema.safeParse({
      default: createCredentials(),
      instances: {
        'not-a-url': createCredentials(),
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('CredentialsFileSchema (union)', () => {
  it('accepts Format A (single credential)', () => {
    const result = CredentialsFileSchema.safeParse(createCredentials());
    expect(result.success).toBe(true);
  });

  it('accepts Format B (multi-credential)', () => {
    const result = CredentialsFileSchema.safeParse(
      createMultiCredentials({
        instances: {
          'https://other.atlassian.net': createCredentials(
            'other@example.com',
            'other-token',
          ),
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts Format B without instances', () => {
    const result = CredentialsFileSchema.safeParse(
      createMultiCredentials(),
    );
    expect(result.success).toBe(true);
  });

  it('rejects missing api_token', () => {
    const result = CredentialsFileSchema.safeParse({
      username: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing username', () => {
    const result = CredentialsFileSchema.safeParse({
      api_token: 'token123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects completely invalid format', () => {
    const result = CredentialsFileSchema.safeParse({
      foo: 'bar',
    });
    expect(result.success).toBe(false);
  });
});

describe('JiraInstanceConfigSchema', () => {
  it('accepts valid merged instance', () => {
    const result = JiraInstanceConfigSchema.safeParse(createInstanceConfig());
    expect(result.success).toBe(true);
  });

  it('rejects instance with invalid URL', () => {
    const result = JiraInstanceConfigSchema.safeParse(
      createInstanceConfig({ url: 'bad-url' }),
    );
    expect(result.success).toBe(false);
  });
});

describe('JiraConfigSchema', () => {
  it('accepts valid merged configuration', () => {
    const result = JiraConfigSchema.safeParse(createMergedConfig());
    expect(result.success).toBe(true);
  });

  it('rejects config without credentials block', () => {
    const config = createMergedConfig();
    const { credentials: _credentials, ...withoutCreds } = config;
    const result = JiraConfigSchema.safeParse(withoutCreds);
    expect(result.success).toBe(false);
  });
});
