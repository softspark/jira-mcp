/**
 * MCP server for Jira integration.
 *
 * Loads configuration, creates the instance pool, cache manager,
 * template registry, and task syncer, then registers MCP tool
 * handlers with the SDK's low-level handler API.
 *
 * Tool definitions live in {@link ./tools/definitions.ts}.
 * Argument helpers live in {@link ./tools/args.ts}.
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
import { TOOL_DEFINITIONS } from './tools/definitions.js';
import {
  asOptionalString,
  requireString,
  asOptionalNumber,
  asOptionalStringArray,
  asOptionalRecord,
} from './tools/args.js';

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

// Re-export for backward compatibility (used by tests)
export { TOOL_DEFINITIONS } from './tools/definitions.js';
export type { ToolDefinition } from './tools/definitions.js';

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
  const { GLOBAL_CACHE_DIR } = await import('./config/paths.js');
  const cacheManager = new CacheManager(GLOBAL_CACHE_DIR, config.credentials.username);
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

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOL_DEFINITIONS,
  }));

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
// Config helpers
// ---------------------------------------------------------------------------

/**
 * Find a project key that maps to the given instance URL.
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
