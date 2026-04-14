/**
 * MCP server for Jira integration.
 *
 * Loads configuration, creates the instance pool, cache manager,
 * template registry, and task syncer, then registers all 15 MCP
 * tools with the SDK's low-level handler API.
 *
 * @module
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { VERSION } from './version.js';
import { loadConfig } from './config/loader.js';
import { InstancePool } from './connector/instance-pool.js';
import { CacheManager } from './cache/manager.js';
import { TaskSyncer } from './cache/syncer.js';
import type { JiraFetcher, JiraIssue as SyncerJiraIssue } from './cache/syncer.js';
import { TemplateRegistry } from './templates/registry.js';
import { failure } from './tools/helpers.js';

import { handleSyncTasks } from './tools/sync-tasks.js';
import { handleReadCachedTasks } from './tools/read-cached-tasks.js';
import { handleUpdateTaskStatus } from './tools/update-task-status.js';
import { handleAddTaskComment } from './tools/add-task-comment.js';
import { handleReassignTask } from './tools/reassign-task.js';
import { handleGetTaskStatuses } from './tools/get-task-statuses.js';
import { handleGetTaskDetails } from './tools/get-task-details.js';
import { handleGetProjectLanguage } from './tools/get-project-language.js';
import { handleLogTaskTime } from './tools/log-task-time.js';
import { handleGetTaskTimeTracking } from './tools/get-task-time-tracking.js';
import { handleListCommentTemplates } from './tools/list-comment-templates.js';
import { handleAddTemplatedComment } from './tools/add-templated-comment.js';
import { handleCreateTask } from './tools/create-task.js';
import { handleUpdateTask } from './tools/update-task.js';
import { handleSearchTasks } from './tools/search-tasks.js';

import type { JiraConnector } from './connector/jira-connector.js';

// ---------------------------------------------------------------------------
// Adapter: JiraConnector -> JiraFetcher (for the syncer)
// ---------------------------------------------------------------------------

/**
 * Adapt a {@link JiraConnector} to the {@link JiraFetcher} interface
 * expected by {@link TaskSyncer}.
 *
 * The connector returns flat issue objects while the syncer expects
 * the nested `fields` shape from the raw Jira API. This adapter
 * bridges the two.
 */
function createFetcherAdapter(
  connector: JiraConnector,
): JiraFetcher {
  return {
    instanceUrl: connector.instanceUrl,
    async searchIssues(jql: string): Promise<readonly SyncerJiraIssue[]> {
      const flatIssues = await connector.searchIssues(jql);
      return flatIssues.map(
        (issue): SyncerJiraIssue => ({
          key: issue.key,
          fields: {
            summary: issue.summary,
            status: { name: issue.status },
            assignee: issue.assignee
              ? { emailAddress: issue.assignee }
              : null,
            priority: issue.priority
              ? { name: issue.priority }
              : null,
            issuetype: { name: issue.issueType },
            created: issue.created,
            updated: issue.updated,
            project: { key: issue.projectKey },
            customfield_10014: issue.epicLink,
          },
        }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema, not Zod)
// ---------------------------------------------------------------------------

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
  };
}

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'sync_tasks',
    description:
      'Sync tasks from Jira to local cache. By default syncs from all configured instances. Optionally scope to a single project or provide a custom JQL query.',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description:
            'Optional project key to sync from a single instance.',
        },
        jql: {
          type: 'string',
          description:
            'Optional JQL query. If omitted, fetches tasks assigned to the current user.',
        },
      },
    },
  },
  {
    name: 'read_cached_tasks',
    description:
      'Read tasks from local cache without hitting the Jira API. Returns a single task when task_key is provided, or all cached tasks otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description:
            'Optional task key (e.g. "PROJ-123"). If omitted, returns all cached tasks.',
        },
      },
    },
  },
  {
    name: 'update_task_status',
    description:
      'Change a task status via Jira workflow transition and update the local cache.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        status: {
          type: 'string',
          description:
            'Target status name (e.g. "In Progress", "Done"). Use get_task_statuses first to check valid transitions.',
        },
      },
      required: ['task_key', 'status'],
    },
  },
  {
    name: 'add_task_comment',
    description:
      'Add a markdown comment to a Jira task. The markdown is automatically converted to ADF format.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        comment: {
          type: 'string',
          description: 'Comment text in markdown format.',
        },
      },
      required: ['task_key', 'comment'],
    },
  },
  {
    name: 'reassign_task',
    description:
      'Reassign a task to a different user by email, or unassign by providing an empty string or omitting assignee_email.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        assignee_email: {
          type: 'string',
          description:
            'Email of the new assignee. Empty string or omit to unassign.',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'get_task_statuses',
    description:
      'Get available workflow transitions for a task. Call this before update_task_status to see valid target statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'get_task_details',
    description:
      'Get full task details from Jira including description and all comments, with ADF content converted to markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'log_task_time',
    description:
      'Log work time to a Jira task. Uses hours and minutes format only (no days). Invalidates cache after logging.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        time_spent: {
          type: 'string',
          description:
            'Time in format "2h", "30m", or "2h 30m". Days are not supported.',
        },
        comment: {
          type: 'string',
          description: 'Optional work description.',
        },
      },
      required: ['task_key', 'time_spent'],
    },
  },
  {
    name: 'get_task_time_tracking',
    description:
      'Get time tracking information for a Jira task (original estimate, time spent, remaining estimate).',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'list_comment_templates',
    description:
      'List all available comment templates with optional category filter. Returns template metadata including required variables.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Optional category filter: "workflow", "communication", "reporting", or "development".',
          enum: ['workflow', 'communication', 'reporting', 'development'],
        },
      },
    },
  },
  {
    name: 'add_templated_comment',
    description:
      'Add a comment using a registered template (with variable substitution) or raw markdown. Provide exactly one of template_id or markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        template_id: {
          type: 'string',
          description:
            'Template identifier. Use list_comment_templates to see available templates.',
        },
        variables: {
          type: 'object',
          description:
            'Key-value map of template variables. Required when using template_id.',
          additionalProperties: { type: 'string' },
        },
        markdown: {
          type: 'string',
          description:
            'Raw markdown comment. Use instead of template_id for freeform comments.',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new Jira issue with optional description, assignee, labels, and epic link.',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Project key (e.g. "DEVOPS"). Determines which Jira instance to use.',
        },
        summary: {
          type: 'string',
          description: 'Issue title / summary.',
        },
        description: {
          type: 'string',
          description:
            'Optional issue description in markdown format. Automatically converted to ADF.',
        },
        type: {
          type: 'string',
          description: 'Issue type name (default "Task"). E.g. "Bug", "Story", "Epic".',
        },
        priority: {
          type: 'string',
          description: 'Priority name (default "Medium"). E.g. "High", "Low", "Critical".',
        },
        assignee_email: {
          type: 'string',
          description: 'Email of the assignee. Resolved to Jira account ID.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label strings to apply to the issue.',
        },
        epic_key: {
          type: 'string',
          description:
            'Epic issue key to link this issue under (e.g. "PROJ-100").',
        },
      },
      required: ['project_key', 'summary'],
    },
  },
  {
    name: 'get_project_language',
    description:
      'Get the configured language for a project. Use before writing comments or descriptions to determine the correct language.',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Project key (e.g. "DEVOPS"). Inferred from task key prefix.',
        },
      },
      required: ['project_key'],
    },
  },
  {
    name: 'update_task',
    description:
      'Update an existing Jira issue. Only provided fields are changed; omitted fields are left untouched.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "DEVOPS-37"). Project is inferred from the key prefix.',
        },
        summary: {
          type: 'string',
          description: 'New issue title / summary.',
        },
        description: {
          type: 'string',
          description:
            'New issue description in markdown format. Automatically converted to ADF.',
        },
        priority: {
          type: 'string',
          description: 'New priority name. E.g. "Medium", "Low", "Critical".',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'New set of label strings (replaces existing labels).',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'search_tasks',
    description:
      'Search Jira issues using JQL. Returns results directly without caching.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default 50).',
        },
        project_key: {
          type: 'string',
          description:
            'Optional project key to determine which Jira instance to query. Defaults to the configured default project.',
        },
      },
      required: ['jql'],
    },
  },
];

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createServer(): Server {
  const server = new Server(
    {
      name: '@softspark/jira-mcp',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

/**
 * Boot the MCP server: load config, create all dependencies, register
 * tool handlers, and connect via stdio transport.
 */
export async function startServer(): Promise<void> {
  // 1. Load configuration
  const config = await loadConfig();

  // 2. Create dependencies
  const pool = new InstancePool(config);
  // Use global cache directory for consistent, predictable cache location
  const { GLOBAL_CACHE_DIR } = await import('./config/paths.js');
  const cacheDir = GLOBAL_CACHE_DIR;
  const cacheManager = new CacheManager(cacheDir, config.credentials.username);
  await cacheManager.initialize();

  const templateRegistry = new TemplateRegistry();

  // 3. Create task syncer with connector-to-fetcher adapter
  const syncer = new TaskSyncer(
    cacheManager,
    config,
    (instanceUrl: string, _username: string, _apiToken: string) =>
      createFetcherAdapter(
        pool.getConnector(
          findProjectKeyForUrl(config, instanceUrl) ?? '',
        ),
      ),
  );

  // 4. Create server and register handlers
  const server = createServer();

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_DEFINITIONS,
  }));

  // Dispatch tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    switch (name) {
      case 'sync_tasks':
        return handleSyncTasks(
          {
            project_key: asOptionalString(args['project_key']),
            jql: asOptionalString(args['jql']),
          },
          { syncer },
        );

      case 'read_cached_tasks':
        return handleReadCachedTasks(
          { task_key: asOptionalString(args['task_key']) },
          { cacheManager },
        );

      case 'update_task_status':
        return handleUpdateTaskStatus(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            status: requireString(args['status'], 'status'),
          },
          { pool, cacheManager },
        );

      case 'add_task_comment':
        return handleAddTaskComment(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            comment: requireString(args['comment'], 'comment'),
          },
          { pool, cacheManager },
        );

      case 'reassign_task':
        return handleReassignTask(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            assignee_email: asOptionalString(args['assignee_email']),
          },
          { pool, cacheManager },
        );

      case 'get_task_statuses':
        return handleGetTaskStatuses(
          { task_key: requireString(args['task_key'], 'task_key') },
          { pool, cacheManager },
        );

      case 'get_task_details':
        return handleGetTaskDetails(
          { task_key: requireString(args['task_key'], 'task_key') },
          { pool, cacheManager, config },
        );

      case 'log_task_time':
        return handleLogTaskTime(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            time_spent: requireString(args['time_spent'], 'time_spent'),
            comment: asOptionalString(args['comment']),
          },
          { pool, cacheManager },
        );

      case 'get_task_time_tracking':
        return handleGetTaskTimeTracking(
          { task_key: requireString(args['task_key'], 'task_key') },
          { pool, cacheManager },
        );

      case 'list_comment_templates':
        return handleListCommentTemplates(
          { category: asOptionalString(args['category']) },
          { templateRegistry },
        );

      case 'add_templated_comment':
        return handleAddTemplatedComment(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            template_id: asOptionalString(args['template_id']),
            variables: asOptionalRecord(args['variables']),
            markdown: asOptionalString(args['markdown']),
          },
          { pool, cacheManager, templateRegistry },
        );

      case 'create_task':
        return handleCreateTask(
          {
            project_key: requireString(args['project_key'], 'project_key'),
            summary: requireString(args['summary'], 'summary'),
            description: asOptionalString(args['description']),
            type: asOptionalString(args['type']),
            priority: asOptionalString(args['priority']),
            assignee_email: asOptionalString(args['assignee_email']),
            labels: asOptionalStringArray(args['labels']),
            epic_key: asOptionalString(args['epic_key']),
          },
          { pool, cacheManager },
        );

      case 'get_project_language':
        return handleGetProjectLanguage(
          { project_key: requireString(args['project_key'], 'project_key') },
          { config },
        );

      case 'update_task':
        return handleUpdateTask(
          {
            task_key: requireString(args['task_key'], 'task_key'),
            summary: asOptionalString(args['summary']),
            description: asOptionalString(args['description']),
            priority: asOptionalString(args['priority']),
            labels: asOptionalStringArray(args['labels']),
          },
          { pool },
        );

      case 'search_tasks':
        return handleSearchTasks(
          {
            jql: requireString(args['jql'], 'jql'),
            max_results: asOptionalNumber(args['max_results']),
            project_key: asOptionalString(args['project_key']),
          },
          { pool, config },
        );

      default:
        return failure(new Error(`Unknown tool: ${name}`));
    }
  });

  // 5. Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Argument helpers
// ---------------------------------------------------------------------------

/**
 * Extract a string value or return undefined.
 */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract a required string value, throwing on missing or wrong type.
 */
function requireString(value: unknown, paramName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
  return value;
}

/**
 * Extract an optional number value or return undefined.
 */
function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Extract an optional string array from an unknown value.
 */
function asOptionalStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

/**
 * Extract an optional Record<string, string> from an unknown value.
 */
function asOptionalRecord(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  // Coerce all values to strings
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = String(v);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Find a project key that maps to the given instance URL.
 *
 * Returns the first matching project key, or undefined if none match.
 */
function findProjectKeyForUrl(
  config: { readonly projects: Readonly<Record<string, { readonly url: string }>> },
  instanceUrl: string,
): string | undefined {
  for (const [key, instance] of Object.entries(config.projects)) {
    if (instance.url === instanceUrl) {
      return key;
    }
  }
  return undefined;
}
