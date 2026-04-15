/**
 * MCP tool definitions for the Jira MCP server.
 *
 * Each definition describes a tool's name, description, and JSON Schema
 * input. These are returned verbatim by the ListTools handler.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
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
        user_approved: {
          type: 'boolean',
          description:
            'Must be true only after the user explicitly approves posting this comment.',
        },
      },
      required: ['task_key', 'comment'],
    },
  },
  {
    name: 'delete_task',
    description:
      'Delete a Jira task, but only when the authenticated user is the task creator.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        user_approved: {
          type: 'boolean',
          description:
            'Must be true only after the user explicitly approves deleting this task.',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'delete_comment',
    description:
      'Delete a Jira comment, but only when the authenticated user is the comment author.',
    inputSchema: {
      type: 'object',
      properties: {
        task_key: {
          type: 'string',
          description: 'Task key (e.g. "PROJ-123").',
        },
        comment_id: {
          type: 'string',
          description: 'Comment ID to delete.',
        },
        user_approved: {
          type: 'boolean',
          description:
            'Must be true only after the user explicitly approves deleting this comment.',
        },
      },
      required: ['task_key', 'comment_id'],
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
        user_approved: {
          type: 'boolean',
          description:
            'Must be true only after the user explicitly approves posting this comment.',
        },
      },
      required: ['task_key'],
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new Jira issue with either explicit fields or a registered task template, plus optional assignee, labels, and epic link.',
    inputSchema: {
      type: 'object',
      properties: {
        project_key: {
          type: 'string',
          description: 'Project key (e.g. "DEVOPS"). Determines which Jira instance to use.',
        },
        summary: {
          type: 'string',
          description: 'Issue title / summary. Do not provide when using template_id.',
        },
        description: {
          type: 'string',
          description:
            'Optional issue description in markdown format. Automatically converted to ADF. Do not provide when using template_id.',
        },
        template_id: {
          type: 'string',
          description:
            'Task template identifier. Use list_task_templates to see available templates.',
        },
        variables: {
          type: 'object',
          description:
            'Key-value map of template variables. Required when using template_id.',
          additionalProperties: { type: 'string' },
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
      required: ['project_key'],
    },
  },
  {
    name: 'list_task_templates',
    description:
      'List all available single-task templates used by create_task. Returns template metadata including required variables.',
    inputSchema: {
      type: 'object',
      properties: {},
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
