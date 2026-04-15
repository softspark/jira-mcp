/**
 * Barrel export for all MCP tool handlers.
 *
 * @module
 */

export { handleSyncTasks } from './sync-tasks.js';
export type { SyncTasksArgs, SyncTasksDeps } from './sync-tasks.js';

export { handleReadCachedTasks } from './read-cached-tasks.js';
export type {
  ReadCachedTasksArgs,
  ReadCachedTasksDeps,
} from './read-cached-tasks.js';

export { handleUpdateTaskStatus } from './update-task-status.js';
export type {
  UpdateTaskStatusArgs,
  UpdateTaskStatusDeps,
} from './update-task-status.js';

export { handleAddTaskComment } from './add-task-comment.js';
export type {
  AddTaskCommentArgs,
  AddTaskCommentDeps,
} from './add-task-comment.js';

export { handleDeleteTask } from './delete-task.js';
export type {
  DeleteTaskArgs,
  DeleteTaskDeps,
} from './delete-task.js';

export { handleDeleteComment } from './delete-comment.js';
export type {
  DeleteCommentArgs,
  DeleteCommentDeps,
} from './delete-comment.js';

export { handleReassignTask } from './reassign-task.js';
export type {
  ReassignTaskArgs,
  ReassignTaskDeps,
} from './reassign-task.js';

export { handleGetTaskStatuses } from './get-task-statuses.js';
export type {
  GetTaskStatusesArgs,
  GetTaskStatusesDeps,
} from './get-task-statuses.js';

export { handleGetTaskDetails } from './get-task-details.js';
export type {
  GetTaskDetailsArgs,
  GetTaskDetailsDeps,
} from './get-task-details.js';

export { handleLogTaskTime } from './log-task-time.js';
export type {
  LogTaskTimeArgs,
  LogTaskTimeDeps,
} from './log-task-time.js';

export { handleGetTaskTimeTracking } from './get-task-time-tracking.js';
export type {
  GetTaskTimeTrackingArgs,
  GetTaskTimeTrackingDeps,
} from './get-task-time-tracking.js';

export { handleListCommentTemplates } from './list-comment-templates.js';
export type {
  ListCommentTemplatesArgs,
  ListCommentTemplatesDeps,
} from './list-comment-templates.js';

export { handleListTaskTemplates } from './list-task-templates.js';
export type { ListTaskTemplatesDeps } from './list-task-templates.js';

export { handleAddTemplatedComment } from './add-templated-comment.js';
export type {
  AddTemplatedCommentArgs,
  AddTemplatedCommentDeps,
} from './add-templated-comment.js';

export { handleCreateTask } from './create-task.js';
export type {
  CreateTaskArgs,
  CreateTaskDeps,
} from './create-task.js';

export { handleGetProjectLanguage } from './get-project-language.js';
export type {
  GetProjectLanguageArgs,
  GetProjectLanguageDeps,
} from './get-project-language.js';

export { handleSearchTasks } from './search-tasks.js';
export type {
  SearchTasksArgs,
  SearchTasksDeps,
} from './search-tasks.js';

export { handleUpdateTask } from './update-task.js';
export type {
  UpdateTaskArgs,
  UpdateTaskDeps,
} from './update-task.js';

export type { ToolResult } from './helpers.js';
export { success, failure } from './helpers.js';
