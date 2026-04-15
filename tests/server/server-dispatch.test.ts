/**
 * Handler dispatch tests for the MCP server.
 *
 * Tests cover:
 *  - Unknown tool dispatch returns a failure response
 *  - requireString behavior (tested via CallTool with missing required param)
 *  - asOptionalString behavior (tested via CallTool with optional params)
 *
 * These tests mock the MCP SDK Server class with a FakeServer that captures
 * handler registrations. This requires a separate file from server.test.ts
 * because those tests need the real Server class for instanceof checks.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// FakeServer: captures handlers registered by startServer()
// ---------------------------------------------------------------------------

/** Handler map: schema method string -> handler function. */
const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();

/** Minimal Server stand-in that captures setRequestHandler calls. */
class FakeServer {
  setRequestHandler(
    schema: unknown,
    handler: (...args: unknown[]) => unknown,
  ): void {
    const s = schema as Record<string, unknown>;
    // MCP SDK schemas expose the method name directly or via zod shape
    const method =
      typeof s['method'] === 'string'
        ? s['method']
        : (
            (s['shape'] as Record<string, unknown> | undefined)?.['method'] as
              | Record<string, unknown>
              | undefined
          )?.['value'];
    if (typeof method === 'string') {
      capturedHandlers.set(method, handler);
    }
  }
  setNotificationHandler(): void {
    /* no-op */
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------

// Replace the MCP SDK Server with our FakeServer
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: FakeServer,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    // no-op transport
  }),
}));

// ListToolsRequestSchema and CallToolRequestSchema need to be available
// for handler registration. We provide minimal objects with method strings.
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { method: 'tools/list' },
  CallToolRequestSchema: { method: 'tools/call' },
}));

// __PKG_VERSION__ is injected at build time
vi.mock('../../src/version.js', () => ({
  VERSION: '1.0.0-test',
}));

// Config loader returns a fake JiraConfig
vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    projects: {
      PROJ0: {
        url: 'https://test.atlassian.net',
        username: 'user@example.com',
        api_token: 'test-api-token-123',
        language: 'pl',
      },
    },
    default_project: 'PROJ0',
    default_language: 'pl',
    credentials: { username: 'user@example.com', api_token: 'test-api-token-123' },
  }),
}));

vi.mock('../../src/config/paths.js', () => ({
  GLOBAL_CACHE_DIR: '/tmp/test-jira-mcp-cache',
  GLOBAL_CONFIG_DIR: '/tmp/test-jira-mcp-config',
  GLOBAL_CONFIG_PATH: '/tmp/test-jira-mcp-config/config.json',
  GLOBAL_CREDENTIALS_PATH: '/tmp/test-jira-mcp-config/credentials.json',
  GLOBAL_COMMENT_TEMPLATES_DIR: '/tmp/test-jira-mcp-config/templates/comments',
  GLOBAL_TASK_TEMPLATE_DEFINITIONS_DIR: '/tmp/test-jira-mcp-config/templates/task-templates',
}));

vi.mock('../../src/cache/manager.js', () => ({
  CacheManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.initialize = vi.fn().mockResolvedValue(undefined);
    this.load = vi.fn();
    this.save = vi.fn();
    this.getTask = vi.fn();
    this.getAllTasks = vi.fn().mockReturnValue([]);
    this.updateTask = vi.fn();
    this.deleteTask = vi.fn();
    this.getMetadata = vi.fn();
    this.cacheDir = '/tmp/test-jira-mcp-cache';
    this.jiraUser = 'user@example.com';
  }),
}));

vi.mock('../../src/connector/instance-pool.js', () => ({
  InstancePool: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getConnector = vi.fn().mockReturnValue({
      instanceUrl: 'https://test.atlassian.net',
      searchIssues: vi.fn().mockResolvedValue([]),
    });
    this.getConnectorForTask = vi.fn().mockReturnValue({
      instanceUrl: 'https://test.atlassian.net',
      searchIssues: vi.fn().mockResolvedValue([]),
    });
    this.getInstances = vi.fn().mockReturnValue([]);
  }),
}));

vi.mock('../../src/cache/syncer.js', () => ({
  TaskSyncer: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.sync = vi.fn().mockResolvedValue(0);
  }),
}));

vi.mock('../../src/templates/catalog.js', () => ({
  loadTemplateCatalog: vi.fn().mockReturnValue({
    commentRegistry: {
      getTemplate: vi.fn(),
      listTemplates: vi.fn().mockReturnValue([]),
      listCategories: vi.fn().mockReturnValue([]),
    },
    taskRegistry: {
      getTemplate: vi.fn(),
      listTemplates: vi.fn().mockReturnValue([]),
    },
  }),
}));

// Stub all tool handlers with minimal success response
vi.mock('../../src/tools/sync-tasks.js', () => ({
  handleSyncTasks: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/read-cached-tasks.js', () => ({
  handleReadCachedTasks: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/update-task-status.js', () => ({
  handleUpdateTaskStatus: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/add-task-comment.js', () => ({
  handleAddTaskComment: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/delete-task.js', () => ({
  handleDeleteTask: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/delete-comment.js', () => ({
  handleDeleteComment: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/reassign-task.js', () => ({
  handleReassignTask: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/get-task-statuses.js', () => ({
  handleGetTaskStatuses: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/get-task-details.js', () => ({
  handleGetTaskDetails: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/get-project-language.js', () => ({
  handleGetProjectLanguage: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/log-task-time.js', () => ({
  handleLogTaskTime: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/get-task-time-tracking.js', () => ({
  handleGetTaskTimeTracking: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/list-comment-templates.js', () => ({
  handleListCommentTemplates: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/list-task-templates.js', () => ({
  handleListTaskTemplates: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/add-templated-comment.js', () => ({
  handleAddTemplatedComment: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/create-task.js', () => ({
  handleCreateTask: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/update-task.js', () => ({
  handleUpdateTask: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));
vi.mock('../../src/tools/search-tasks.js', () => ({
  handleSearchTasks: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"success":true}' }],
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(
  result: { content: Array<{ type: string; text?: string }> },
): Record<string, unknown> {
  const first = result.content[0];
  return JSON.parse((first as { text: string }).text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Handler type for CallTool dispatch
// ---------------------------------------------------------------------------

type CallToolHandler = (request: {
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}) => Promise<{
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}>;

// ---------------------------------------------------------------------------
// Boot server once, capture handlers
// ---------------------------------------------------------------------------

let callToolHandler: CallToolHandler;

beforeAll(async () => {
  capturedHandlers.clear();
  const { startServer } = await import('../../src/server.js');
  await startServer();

  const handler = capturedHandlers.get('tools/call');
  if (!handler) {
    throw new Error('tools/call handler was not registered during startServer()');
  }
  callToolHandler = handler as CallToolHandler;
});

// ---------------------------------------------------------------------------
// Unknown tool dispatch
// ---------------------------------------------------------------------------

describe('Unknown tool dispatch', () => {
  it('returns failure response for unknown tool name', async () => {
    const result = await callToolHandler({
      params: { name: 'nonexistent_tool', arguments: {} },
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(false);
    expect(parsed['error']).toContain('Unknown tool');
    expect(parsed['error']).toContain('nonexistent_tool');
  });

  it('returns failure with error code UNKNOWN_ERROR', async () => {
    const result = await callToolHandler({
      params: { name: 'does_not_exist' },
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed['code']).toBe('UNKNOWN_ERROR');
  });
});

// ---------------------------------------------------------------------------
// requireString behavior (via CallTool dispatch)
//
// requireString throws an Error on missing/invalid required params.
// In production, the MCP SDK's Protocol layer catches this and converts
// it to an error response. Here we test the raw handler throw behavior.
// ---------------------------------------------------------------------------

describe('requireString via tool dispatch', () => {
  it('throws when required task_key is missing', async () => {
    await expect(
      callToolHandler({
        params: { name: 'update_task_status', arguments: { status: 'Done' } },
      }),
    ).rejects.toThrow('Missing required parameter: task_key');
  });

  it('throws when required param is empty string', async () => {
    await expect(
      callToolHandler({
        params: { name: 'get_task_details', arguments: { task_key: '' } },
      }),
    ).rejects.toThrow('Missing required parameter: task_key');
  });

  it('throws when required param is a number instead of string', async () => {
    await expect(
      callToolHandler({
        params: { name: 'get_task_details', arguments: { task_key: 12345 } },
      }),
    ).rejects.toThrow('Missing required parameter: task_key');
  });

  it('throws when required param is null', async () => {
    await expect(
      callToolHandler({
        params: { name: 'get_task_statuses', arguments: { task_key: null } },
      }),
    ).rejects.toThrow('Missing required parameter: task_key');
  });

  it('throws when arguments object is entirely missing', async () => {
    await expect(
      callToolHandler({
        params: { name: 'update_task_status' },
      }),
    ).rejects.toThrow('Missing required parameter: task_key');
  });

  it('throws with correct param name for non-task_key params', async () => {
    await expect(
      callToolHandler({
        params: { name: 'update_task_status', arguments: { task_key: 'PROJ-1' } },
      }),
    ).rejects.toThrow('Missing required parameter: status');
  });

  it('throws for missing project_key on create_task', async () => {
    await expect(
      callToolHandler({
        params: { name: 'create_task', arguments: { summary: 'A task' } },
      }),
    ).rejects.toThrow('Missing required parameter: project_key');
  });

  it('throws for missing jql on search_tasks', async () => {
    await expect(
      callToolHandler({
        params: { name: 'search_tasks', arguments: {} },
      }),
    ).rejects.toThrow('Missing required parameter: jql');
  });
});

// ---------------------------------------------------------------------------
// asOptionalString behavior (via CallTool dispatch)
//
// asOptionalString returns undefined for non-string values, which is
// valid for optional params. These tests verify that tool dispatch
// succeeds (delegates to the mocked handler) when optional params
// are omitted or have non-string types.
// ---------------------------------------------------------------------------

describe('asOptionalString via tool dispatch', () => {
  it('succeeds when optional params are omitted', async () => {
    const result = await callToolHandler({
      params: { name: 'sync_tasks', arguments: {} },
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
  });

  it('succeeds when optional string param is provided', async () => {
    const result = await callToolHandler({
      params: { name: 'sync_tasks', arguments: { jql: 'project = TEST' } },
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
  });

  it('succeeds when optional param is a non-string type (treated as undefined)', async () => {
    // read_cached_tasks has an optional task_key. Passing a number makes
    // asOptionalString return undefined, which is valid for optional params.
    const result = await callToolHandler({
      params: { name: 'read_cached_tasks', arguments: { task_key: 42 } },
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
  });

  it('succeeds when optional param is null (treated as undefined)', async () => {
    const result = await callToolHandler({
      params: { name: 'list_comment_templates', arguments: { category: null } },
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseResult(result);
    expect(parsed['success']).toBe(true);
  });
});
