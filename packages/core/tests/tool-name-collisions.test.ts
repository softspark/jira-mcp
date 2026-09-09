// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Workspace invariant: the two servers must not share a tool name.
 *
 * This is the reason the servers are split at all. People register both in
 * one MCP client, where the two tool lists are concatenated; a shared name
 * would make the client's choice between them arbitrary, and the failure
 * would be silent — the wrong tool returns a plausible answer about the wrong
 * product.
 *
 * The test lives in core rather than in either server because neither package
 * can see the other's tool list on its own, and it reaches across package
 * directories deliberately: this asserts a property of the pair, not of a
 * package. Nothing in `src/` does that.
 */

import { describe, it, expect } from 'vitest';

import { TOOL_DEFINITIONS } from '../../jira-mcp/src/tools/definitions.js';
import { CONFLUENCE_TOOL_DEFINITIONS } from '../../confluence-mcp/src/confluence/tools/definitions.js';

describe('tool names across the workspace', () => {
  it('never collide between the Jira and Confluence servers', () => {
    const jira = new Set(TOOL_DEFINITIONS.map((d) => d.name));
    const overlap = CONFLUENCE_TOOL_DEFINITIONS.map((d) => d.name).filter((n) =>
      jira.has(n),
    );

    expect(overlap).toEqual([]);
  });

  it('are unique within each server', () => {
    for (const defs of [TOOL_DEFINITIONS, CONFLUENCE_TOOL_DEFINITIONS]) {
      const names = defs.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('cover both servers, so an empty import cannot pass vacuously', () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(10);
    expect(CONFLUENCE_TOOL_DEFINITIONS.length).toBeGreaterThan(10);
  });
});
