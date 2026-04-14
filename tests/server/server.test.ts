/**
 * Boundary tests for the MCP server.
 *
 * Tests cover:
 *  - createServer() factory returns a correctly configured Server instance
 *  - TOOL_DEFINITIONS structure and completeness (15 tools)
 *
 * Handler dispatch tests (unknown tool, requireString, asOptionalString)
 * live in server-dispatch.test.ts because they need a different mock for
 * the MCP SDK Server class.
 */

import { describe, it, expect, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock version module -- __PKG_VERSION__ is injected at build time by tsup
vi.mock('../../src/version.js', () => ({
  VERSION: '1.0.0-test',
}));

import { createServer, TOOL_DEFINITIONS } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Expected tool names (alphabetical for stable comparison)
// ---------------------------------------------------------------------------

const EXPECTED_TOOL_NAMES: readonly string[] = [
  'add_task_comment',
  'add_templated_comment',
  'create_task',
  'get_project_language',
  'get_task_details',
  'get_task_statuses',
  'get_task_time_tracking',
  'list_comment_templates',
  'log_task_time',
  'read_cached_tasks',
  'reassign_task',
  'search_tasks',
  'sync_tasks',
  'update_task',
  'update_task_status',
];

// ---------------------------------------------------------------------------
// createServer()
// ---------------------------------------------------------------------------

describe('createServer', () => {
  it('returns a Server instance', () => {
    const server = createServer();
    expect(server).toBeInstanceOf(Server);
  });

  it('creates independent instances', () => {
    const a = createServer();
    const b = createServer();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// TOOL_DEFINITIONS
// ---------------------------------------------------------------------------

describe('TOOL_DEFINITIONS', () => {
  it('has exactly 15 tool definitions', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(15);
  });

  it('contains all expected tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('each tool has a non-empty name', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('each tool has a non-empty description', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('each tool has inputSchema with type "object" and properties', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema.type).toBe('object');
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  });

  it('tools with required params declare them in inputSchema.required', () => {
    const expected: Record<string, readonly string[]> = {
      update_task_status: ['task_key', 'status'],
      add_task_comment: ['task_key', 'comment'],
      reassign_task: ['task_key'],
      get_task_statuses: ['task_key'],
      get_task_details: ['task_key'],
      log_task_time: ['task_key', 'time_spent'],
      get_task_time_tracking: ['task_key'],
      add_templated_comment: ['task_key'],
      create_task: ['project_key', 'summary'],
      get_project_language: ['project_key'],
      update_task: ['task_key'],
      search_tasks: ['jql'],
    };

    for (const tool of TOOL_DEFINITIONS) {
      const req = expected[tool.name];
      if (req) {
        expect(
          [...(tool.inputSchema.required ?? [])].sort(),
          `${tool.name} required params`,
        ).toEqual([...req].sort());
      }
    }
  });

  it('tools without required params omit the required field', () => {
    const optional = ['sync_tasks', 'read_cached_tasks', 'list_comment_templates'];
    for (const name of optional) {
      const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
      expect(tool, `${name} should exist`).toBeDefined();
      expect(tool!.inputSchema.required).toBeUndefined();
    }
  });

  it('tool names use snake_case convention', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('no duplicate tool names', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
