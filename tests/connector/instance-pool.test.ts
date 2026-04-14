/**
 * Tests for InstancePool.
 */

import { describe, it, expect, vi } from 'vitest';

import { InstancePool } from '../../src/connector/instance-pool';
import { ConfigValidationError } from '../../src/errors/index';
import { createMergedConfig, createInstanceConfig } from '../fixtures/config';

// Mock JiraConnector so we don't create real HTTP clients
vi.mock('../../src/connector/jira-connector', () => ({
  JiraConnector: vi.fn().mockImplementation((config: { url: string }) => ({
    instanceUrl: config.url,
    searchIssues: vi.fn(),
    getIssue: vi.fn(),
  })),
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
});
