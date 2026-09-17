// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for InstancePool.
 */

import { describe, it, expect, vi } from 'vitest';

import { InstancePool } from '../../src/connector/instance-pool';
import {
  ConfigValidationError,
  TempoNotConfiguredError,
} from '@softspark/atlassian-mcp-core';
import {
  createMergedConfig,
  createInstanceConfig,
} from '@softspark/atlassian-mcp-core/test-fixtures';

// Mock JiraConnector so we don't create real HTTP clients
vi.mock('../../src/connector/jira-connector', () => ({
  JiraConnector: vi.fn().mockImplementation(function (this: Record<string, unknown>, config: { url: string }) {
    this.instanceUrl = config.url;
    this.searchIssues = vi.fn();
    this.getIssue = vi.fn();
  }),
}));

// Same for TempoClient: the pool is about routing, not transport
vi.mock('../../src/connector/tempo-client', () => ({
  TempoClient: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    config: { apiUrl: string; token: string },
  ) {
    this.apiUrl = config.apiUrl;
    this.token = config.token;
    this.getWorklogs = vi.fn();
  }),
}));

describe('InstancePool', () => {
  it('creates a connector for a known project key', () => {
    const config = createMergedConfig();
    const pool = new InstancePool(config);

    const connector = pool.getConnector('PROJ0');
    expect(connector).toBeDefined();
    expect(connector.instanceUrl).toBe('https://test.atlassian.net');
  });

  it('throws ConfigValidationError for unknown project key', () => {
    const config = createMergedConfig();
    const pool = new InstancePool(config);

    expect(() => pool.getConnector('UNKNOWN')).toThrow(
      ConfigValidationError,
    );
    expect(() => pool.getConnector('UNKNOWN')).toThrow(
      "Project 'UNKNOWN' not found",
    );
  });

  it('extracts project key from task key in getConnectorForTask', () => {
    const config = createMergedConfig();
    const pool = new InstancePool(config);

    const connector = pool.getConnectorForTask('PROJ0-123');
    expect(connector).toBeDefined();
    expect(connector.instanceUrl).toBe('https://test.atlassian.net');
  });

  it('throws for invalid task key format', () => {
    const config = createMergedConfig();
    const pool = new InstancePool(config);

    expect(() => pool.getConnectorForTask('UNKNOWN-1')).toThrow(
      ConfigValidationError,
    );
  });

  it('reuses the same connector for projects sharing a URL', () => {
    const config = createMergedConfig({
      projects: {
        PROJ_A: createInstanceConfig({ url: 'https://shared.atlassian.net' }),
        PROJ_B: createInstanceConfig({ url: 'https://shared.atlassian.net' }),
      },
    });
    const pool = new InstancePool(config);

    const connA = pool.getConnector('PROJ_A');
    const connB = pool.getConnector('PROJ_B');
    expect(connA).toBe(connB);
  });

  it('creates separate connectors for different URLs', () => {
    const config = createMergedConfig({
      projects: {
        PROJ_A: createInstanceConfig({ url: 'https://a.atlassian.net' }),
        PROJ_B: createInstanceConfig({ url: 'https://b.atlassian.net' }),
      },
    });
    const pool = new InstancePool(config);

    const connA = pool.getConnector('PROJ_A');
    const connB = pool.getConnector('PROJ_B');
    expect(connA).not.toBe(connB);
  });

  it('getInstances returns deduplicated instances', () => {
    const config = createMergedConfig({
      projects: {
        PROJ_A: createInstanceConfig({ url: 'https://shared.atlassian.net' }),
        PROJ_B: createInstanceConfig({ url: 'https://shared.atlassian.net' }),
        PROJ_C: createInstanceConfig({ url: 'https://other.atlassian.net' }),
      },
    });
    const pool = new InstancePool(config);

    const instances = pool.getInstances();
    expect(instances.size).toBe(2);

    const shared = instances.get('https://shared.atlassian.net');
    expect(shared).toBeDefined();
    expect(shared!.projectKeys).toContain('PROJ_A');
    expect(shared!.projectKeys).toContain('PROJ_B');

    const other = instances.get('https://other.atlassian.net');
    expect(other).toBeDefined();
    expect(other!.projectKeys).toEqual(['PROJ_C']);
  });

  describe('getTempoClient', () => {
    it('builds a client from the site token and the configured API URL', () => {
      const config = createMergedConfig({
        projects: {
          PROJ_A: createInstanceConfig({ tempo_token: 'tempo-a' }),
        },
        tempo_api_url: 'https://api.eu.tempo.io/4',
      });
      const pool = new InstancePool(config);

      const client = pool.getTempoClient('PROJ_A') as unknown as {
        apiUrl: string;
        token: string;
      };

      expect(client.apiUrl).toBe('https://api.eu.tempo.io/4');
      expect(client.token).toBe('tempo-a');
    });

    it('reuses one client for projects sharing a URL', () => {
      const config = createMergedConfig({
        projects: {
          PROJ_A: createInstanceConfig({ url: 'https://shared.atlassian.net', tempo_token: 't' }),
          PROJ_B: createInstanceConfig({ url: 'https://shared.atlassian.net', tempo_token: 't' }),
        },
      });
      const pool = new InstancePool(config);

      expect(pool.getTempoClient('PROJ_A')).toBe(pool.getTempoClient('PROJ_B'));
    });

    it('throws TempoNotConfiguredError when the site has no token', () => {
      const pool = new InstancePool(createMergedConfig());

      expect(() => pool.getTempoClient('PROJ0')).toThrow(TempoNotConfiguredError);
      expect(() => pool.getTempoClient('PROJ0')).toThrow(/set-tempo-token/);
    });

    it('throws ConfigValidationError for an unknown project key', () => {
      const pool = new InstancePool(createMergedConfig());

      expect(() => pool.getTempoClient('UNKNOWN')).toThrow(ConfigValidationError);
    });

    it('does not create a Tempo client until one is asked for', () => {
      const pool = new InstancePool(createMergedConfig());

      expect(() => pool.getConnector('PROJ0')).not.toThrow();
    });
  });
});
