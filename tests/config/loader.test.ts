/**
 * Tests for the configuration loader.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JiraConfig } from '../../src/config/schema';

import {
  loadConfig,
  getProjectConfig,
  getUniqueInstances,
} from '../../src/config/loader';
import {
  ConfigNotFoundError,
  ConfigValidationError,
} from '../../src/errors/index';
import {
  createConfigFile,
  createCredentials,
  createMultiCredentials,
  createMergedConfig,
  createInstanceConfig,
} from '../fixtures/config';

// Mock fs/promises at module level
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

// Import the mocked module
import { readFile, access } from 'node:fs/promises';

const mockedReadFile = vi.mocked(readFile);
const mockedAccess = vi.mocked(access);

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env['JIRA_CONFIG_PATH'];
  delete process.env['JIRA_CREDENTIALS_PATH'];
});

describe('loadConfig', () => {
  it('loads and merges config.json + credentials.json', async () => {
    const configData = createConfigFile(1);
    const credsData = createCredentials();

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    const result = await loadConfig({
      configPath: '/fake/config.json',
      credentialsPath: '/fake/credentials.json',
    });

    expect(result.default_project).toBe('PROJ0');
    expect(result.projects['PROJ0']).toBeDefined();
    expect(result.projects['PROJ0']?.username).toBe(credsData.username);
    expect(result.credentials.api_token).toBe(credsData.api_token);
  });

  it('throws ConfigNotFoundError when config file is missing', async () => {
    mockedAccess.mockRejectedValue(new Error('ENOENT'));

    await expect(
      loadConfig({
        configPath: '/nonexistent/config.json',
        credentialsPath: '/fake/credentials.json',
      }),
    ).rejects.toThrow(ConfigNotFoundError);
  });

  it('throws ConfigValidationError for invalid JSON in config file', async () => {
    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile.mockResolvedValueOnce('not valid json');

    await expect(
      loadConfig({
        configPath: '/fake/config.json',
        credentialsPath: '/fake/credentials.json',
      }),
    ).rejects.toThrow(ConfigValidationError);
  });

  it('throws ConfigValidationError when config fails schema validation', async () => {
    const invalidConfig = { projects: {}, default_project: 'MISSING' };
    const credsData = createCredentials();

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(invalidConfig))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    await expect(
      loadConfig({
        configPath: '/fake/config.json',
        credentialsPath: '/fake/credentials.json',
      }),
    ).rejects.toThrow(ConfigValidationError);
  });

  it('throws ConfigValidationError when credentials fail schema validation', async () => {
    const configData = createConfigFile(1);
    const badCreds = { username: 'not-email', api_token: '' };

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(badCreds));

    await expect(
      loadConfig({
        configPath: '/fake/config.json',
        credentialsPath: '/fake/credentials.json',
      }),
    ).rejects.toThrow(ConfigValidationError);
  });

  it('loads Format B (multi-credential) and resolves per-instance credentials', async () => {
    const configData = {
      projects: {
        PROJ_A: { url: 'https://team-a.atlassian.net' },
        PROJ_B: { url: 'https://team-b.atlassian.net' },
      },
      default_project: 'PROJ_A',
    };

    const credsData = createMultiCredentials({
      default: createCredentials('default@example.com', 'default-token'),
      instances: {
        'https://team-b.atlassian.net': createCredentials(
          'team-b@example.com',
          'team-b-token',
        ),
      },
    });

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    const result = await loadConfig({
      configPath: '/fake/config.json',
      credentialsPath: '/fake/credentials.json',
    });

    // PROJ_A has no instance override, should use default
    expect(result.projects['PROJ_A']?.username).toBe('default@example.com');
    expect(result.projects['PROJ_A']?.api_token).toBe('default-token');

    // PROJ_B matches an instance override
    expect(result.projects['PROJ_B']?.username).toBe('team-b@example.com');
    expect(result.projects['PROJ_B']?.api_token).toBe('team-b-token');

    // credentials on the config is the default
    expect(result.credentials.username).toBe('default@example.com');
  });

  it('loads Format B without instances -- all projects get default', async () => {
    const configData = createConfigFile(2);
    const credsData = createMultiCredentials({
      default: createCredentials('shared@example.com', 'shared-token'),
    });

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    const result = await loadConfig({
      configPath: '/fake/config.json',
      credentialsPath: '/fake/credentials.json',
    });

    expect(result.projects['PROJ0']?.username).toBe('shared@example.com');
    expect(result.projects['PROJ1']?.username).toBe('shared@example.com');
    expect(result.credentials.username).toBe('shared@example.com');
  });

  it('Format A (single credential) applies same credential to all projects', async () => {
    const configData = createConfigFile(2);
    const credsData = createCredentials('single@example.com', 'single-token');

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    const result = await loadConfig({
      configPath: '/fake/config.json',
      credentialsPath: '/fake/credentials.json',
    });

    expect(result.projects['PROJ0']?.username).toBe('single@example.com');
    expect(result.projects['PROJ1']?.username).toBe('single@example.com');
    expect(result.credentials.username).toBe('single@example.com');
  });

  it('uses env vars for path resolution when no explicit paths', async () => {
    const configData = createConfigFile(1);
    const credsData = createCredentials();

    process.env['JIRA_CONFIG_PATH'] = '/env/config.json';
    process.env['JIRA_CREDENTIALS_PATH'] = '/env/credentials.json';

    mockedAccess.mockResolvedValue(undefined);
    mockedReadFile
      .mockResolvedValueOnce(JSON.stringify(configData))
      .mockResolvedValueOnce(JSON.stringify(credsData));

    const result = await loadConfig();

    expect(result.default_project).toBe('PROJ0');

    delete process.env['JIRA_CONFIG_PATH'];
    delete process.env['JIRA_CREDENTIALS_PATH'];
  });
});

describe('getProjectConfig', () => {
  it('returns correct instance for explicit project key', () => {
    const config = createMergedConfig();
    const [key, instance] = getProjectConfig(config, 'PROJ0');

    expect(key).toBe('PROJ0');
    expect(instance.url).toBe('https://test.atlassian.net');
  });

  it('uses default_project when no key provided', () => {
    const config = createMergedConfig();
    const [key, instance] = getProjectConfig(config);

    expect(key).toBe('PROJ0');
    expect(instance).toBeDefined();
  });

  it('throws ConfigValidationError for unknown project key', () => {
    const config = createMergedConfig();

    expect(() => getProjectConfig(config, 'UNKNOWN')).toThrow(
      ConfigValidationError,
    );
  });
});

describe('getUniqueInstances', () => {
  it('deduplicates projects sharing the same URL', () => {
    const config: JiraConfig = {
      projects: {
        PROJ_A: createInstanceConfig({
          url: 'https://shared.atlassian.net',
        }),
        PROJ_B: createInstanceConfig({
          url: 'https://shared.atlassian.net',
        }),
        PROJ_C: createInstanceConfig({
          url: 'https://other.atlassian.net',
        }),
      },
      default_project: 'PROJ_A',
      credentials: createCredentials(),
    };

    const instances = getUniqueInstances(config);

    expect(instances).toHaveLength(2);

    const sharedInstance = instances.find(
      (i) => i.url === 'https://shared.atlassian.net',
    );
    expect(sharedInstance?.projectKeys).toContain('PROJ_A');
    expect(sharedInstance?.projectKeys).toContain('PROJ_B');

    const otherInstance = instances.find(
      (i) => i.url === 'https://other.atlassian.net',
    );
    expect(otherInstance?.projectKeys).toEqual(['PROJ_C']);
  });

  it('returns all instances when URLs are unique', () => {
    const config = createMergedConfig();
    const instances = getUniqueInstances(config);

    expect(instances).toHaveLength(1);
    expect(instances[0]?.projectKeys).toEqual(['PROJ0']);
  });

  it('returns empty array for config with no projects', () => {
    const config: JiraConfig = {
      projects: {},
      default_project: '',
      credentials: createCredentials(),
    };

    const instances = getUniqueInstances(config);
    expect(instances).toHaveLength(0);
  });
});
