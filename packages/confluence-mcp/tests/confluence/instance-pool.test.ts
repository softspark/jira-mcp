// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for ConfluenceInstancePool.
 *
 * The routing rules matter more here than in the Jira pool: a page id carries
 * no space, so an unresolvable space key must fail loudly rather than pick
 * a site at random.
 */

import { describe, it, expect } from 'vitest';

import { ConfluenceInstancePool } from '../../src/confluence/instance-pool';
import type { ConfluenceConfig } from '@softspark/atlassian-mcp-core';
import { ConfigValidationError } from '@softspark/atlassian-mcp-core';

function makeConfig(
  spaces: Record<string, string>,
  defaultSpace?: string,
): ConfluenceConfig {
  const entries = Object.entries(spaces).map(([key, url]) => [
    key,
    {
      url,
      username: 'user@example.com',
      api_token: 'token',
      language: 'en' as const,
    },
  ]);

  return {
    spaces: Object.fromEntries(entries) as ConfluenceConfig['spaces'],
    ...(defaultSpace !== undefined ? { default_space: defaultSpace } : {}),
    default_language: 'en',
    credentials: { username: 'user@example.com', api_token: 'token' },
  };
}

describe('ConfluenceInstancePool', () => {
  describe('connector deduplication', () => {
    it('shares one connector between spaces on the same site', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({
          DOCS: 'https://one.atlassian.net',
          KB: 'https://one.atlassian.net',
        }),
      );

      expect(pool.getConnector('DOCS')).toBe(pool.getConnector('KB'));
      expect(pool.getSites().size).toBe(1);
    });

    it('creates one connector per distinct site', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({
          DOCS: 'https://one.atlassian.net',
          KB: 'https://two.atlassian.net',
        }),
      );

      expect(pool.getConnector('DOCS')).not.toBe(pool.getConnector('KB'));
      expect(pool.getSites().size).toBe(2);
    });

    it('lists configured space keys', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({ DOCS: 'https://one.atlassian.net' }),
      );

      expect(pool.getSpaceKeys()).toEqual(['DOCS']);
    });
  });

  describe('space resolution', () => {
    it('prefers an explicit key', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig(
          { DOCS: 'https://one.atlassian.net', KB: 'https://one.atlassian.net' },
          'DOCS',
        ),
      );

      expect(pool.resolveSpaceKey('KB')).toBe('KB');
    });

    it('falls back to default_space', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig(
          { DOCS: 'https://one.atlassian.net', KB: 'https://one.atlassian.net' },
          'KB',
        ),
      );

      expect(pool.resolveSpaceKey()).toBe('KB');
    });

    it('falls back to the only configured space when there is no default', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({ DOCS: 'https://one.atlassian.net' }),
      );

      expect(pool.resolveSpaceKey()).toBe('DOCS');
    });

    it('refuses to guess between several spaces with no default', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({
          DOCS: 'https://one.atlassian.net',
          KB: 'https://two.atlassian.net',
        }),
      );

      expect(() => pool.resolveSpaceKey()).toThrow(ConfigValidationError);
      expect(() => pool.resolveSpaceKey()).toThrow(/space_key is required/);
    });

    it('treats an empty string as no key given', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({ DOCS: 'https://one.atlassian.net' }),
      );

      expect(pool.resolveSpaceKey('')).toBe('DOCS');
    });

    it('names the configured spaces when a key is unknown', () => {
      const pool = new ConfluenceInstancePool(
        makeConfig({ DOCS: 'https://one.atlassian.net' }),
      );

      expect(() => pool.getConnector('NOPE')).toThrow(/DOCS/);
    });
  });
});
