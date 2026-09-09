// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Pool of ConfluenceConnector instances keyed by site URL.
 *
 * Mirrors {@link ../connector/instance-pool.ts} with one deliberate
 * difference: Jira routes by parsing the project key out of an issue key
 * (`PROJ-123` → `PROJ`), but Confluence page ids are opaque numbers that
 * carry no space information. A page id alone therefore cannot pick a
 * connector, so callers either name a space or fall back to the default
 * space. On a single-site setup that fallback is exact; on a multi-site
 * setup naming the space is what keeps the call unambiguous.
 *
 * @module
 */

import type { ConfluenceConfig } from '@softspark/atlassian-mcp-core';
import { ConfigValidationError } from '@softspark/atlassian-mcp-core';
import { ConfluenceConnector } from './connector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Metadata about a single Confluence site in the pool. */
export interface PooledSite {
  readonly connector: ConfluenceConnector;
  readonly spaceKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// ConfluenceInstancePool
// ---------------------------------------------------------------------------

export class ConfluenceInstancePool {
  /** Connectors keyed by space key for fast lookup. */
  private readonly bySpace = new Map<string, ConfluenceConnector>();
  /** Deduplicated sites keyed by URL. */
  private readonly byUrl = new Map<string, PooledSite>();
  private readonly config: ConfluenceConfig;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    this.#buildPool();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get the connector for a specific space key.
   *
   * @throws {ConfigValidationError} If the space key is not configured.
   */
  getConnector(spaceKey: string): ConfluenceConnector {
    const connector = this.bySpace.get(spaceKey);
    if (!connector) {
      throw new ConfigValidationError(
        `Space '${spaceKey}' not found in configuration. Configured spaces: ${[
          ...this.bySpace.keys(),
        ].join(', ')}`,
      );
    }
    return connector;
  }

  /**
   * Resolve the space key a call should use.
   *
   * Order: explicit argument, then `default_space`, then the only configured
   * space. With several spaces and no default, an unnamed call is an error
   * rather than a guess, because writing a page into the wrong space is not
   * something the caller can see before it happens.
   *
   * @throws {ConfigValidationError} If nothing resolves.
   */
  resolveSpaceKey(spaceKey?: string): string {
    if (spaceKey !== undefined && spaceKey.length > 0) {
      return spaceKey;
    }
    if (this.config.default_space !== undefined) {
      return this.config.default_space;
    }

    const keys = [...this.bySpace.keys()];
    const only = keys[0];
    if (keys.length === 1 && only !== undefined) {
      return only;
    }

    throw new ConfigValidationError(
      `space_key is required: several spaces are configured (${keys.join(', ')}) and no default_space is set. ` +
        'Set one with: confluence-mcp space set-default <SPACE_KEY>',
    );
  }

  /** Get the connector for a call, applying {@link resolveSpaceKey} first. */
  getConnectorForSpace(spaceKey?: string): ConfluenceConnector {
    return this.getConnector(this.resolveSpaceKey(spaceKey));
  }

  /** Get all unique sites with their associated space keys. */
  getSites(): ReadonlyMap<string, PooledSite> {
    return this.byUrl;
  }

  /** Every configured space key, in configuration order. */
  getSpaceKeys(): readonly string[] {
    return [...this.bySpace.keys()];
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Build the connector pool by deduplicating on site URL. */
  #buildPool(): void {
    const urlToKeys = new Map<string, string[]>();

    for (const [key, space] of Object.entries(this.config.spaces)) {
      const existing = urlToKeys.get(space.url);
      if (existing) {
        existing.push(key);
      } else {
        urlToKeys.set(space.url, [key]);
      }
    }

    for (const [url, keys] of urlToKeys) {
      const firstKey = keys[0];
      if (!firstKey) continue;

      const spaceConfig = this.config.spaces[firstKey];
      if (!spaceConfig) continue;

      const connector = new ConfluenceConnector(spaceConfig);
      this.byUrl.set(url, { connector, spaceKeys: keys });

      for (const key of keys) {
        this.bySpace.set(key, connector);
      }
    }
  }
}
