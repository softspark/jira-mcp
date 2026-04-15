/**
 * Reusable mock factories for tool handler and operations tests.
 *
 * Each factory returns an object that satisfies the relevant interface
 * at the type level while exposing vi.fn() stubs for all methods.
 */

import { vi } from 'vitest';

import type { JiraConnector } from '../../src/connector/jira-connector';
import type { CacheManager } from '../../src/cache/manager';
import type { InstancePool } from '../../src/connector/instance-pool';
import type { TemplateRegistry } from '../../src/templates/registry';
import type { TaskTemplateRegistry } from '../../src/templates/task-registry';
import type { TaskSyncer } from '../../src/cache/syncer';
import type { WorkflowCacheManager } from '../../src/cache/workflow-cache';
import type { UserCacheManager } from '../../src/cache/user-cache';

// ---------------------------------------------------------------------------
// JiraConnector
// ---------------------------------------------------------------------------

interface MockJiraConnector {
  searchIssues: ReturnType<typeof vi.fn>;
  getIssue: ReturnType<typeof vi.fn>;
  addComment: ReturnType<typeof vi.fn>;
  getTransitions: ReturnType<typeof vi.fn>;
  doTransition: ReturnType<typeof vi.fn>;
  assignIssue: ReturnType<typeof vi.fn>;
  findUser: ReturnType<typeof vi.fn>;
  addWorklog: ReturnType<typeof vi.fn>;
  getTimeTracking: ReturnType<typeof vi.fn>;
  createIssue: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
  getFields: ReturnType<typeof vi.fn>;
  searchUsers: ReturnType<typeof vi.fn>;
  getProjectStatuses: ReturnType<typeof vi.fn>;
  instanceUrl: string;
}

export function createMockConnector(
  instanceUrl = 'https://test.atlassian.net',
): MockJiraConnector {
  return {
    searchIssues: vi.fn(),
    getIssue: vi.fn(),
    addComment: vi.fn(),
    getTransitions: vi.fn(),
    doTransition: vi.fn(),
    assignIssue: vi.fn(),
    findUser: vi.fn(),
    addWorklog: vi.fn(),
    getTimeTracking: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    getFields: vi.fn(),
    searchUsers: vi.fn(),
    getProjectStatuses: vi.fn(),
    instanceUrl,
  };
}

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

interface MockCacheManager {
  initialize: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  getTask: ReturnType<typeof vi.fn>;
  getAllTasks: ReturnType<typeof vi.fn>;
  updateTask: ReturnType<typeof vi.fn>;
  deleteTask: ReturnType<typeof vi.fn>;
  getMetadata: ReturnType<typeof vi.fn>;
  cacheDir: string;
  jiraUser: string;
  cachePath: string;
}

export function createMockCacheManager(): MockCacheManager {
  return {
    initialize: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    getTask: vi.fn(),
    getAllTasks: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getMetadata: vi.fn(),
    cacheDir: '/tmp/test-cache',
    jiraUser: 'user@example.com',
    cachePath: '/tmp/test-cache/tasks_user_at_example_com.json',
  };
}

// ---------------------------------------------------------------------------
// InstancePool
// ---------------------------------------------------------------------------

interface MockInstancePool {
  getConnector: ReturnType<typeof vi.fn>;
  getConnectorForTask: ReturnType<typeof vi.fn>;
  getInstances: ReturnType<typeof vi.fn>;
}

export function createMockInstancePool(): MockInstancePool {
  return {
    getConnector: vi.fn(),
    getConnectorForTask: vi.fn(),
    getInstances: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// TemplateRegistry
// ---------------------------------------------------------------------------

interface MockTemplateRegistry {
  getTemplate: ReturnType<typeof vi.fn>;
  listTemplates: ReturnType<typeof vi.fn>;
  listCategories: ReturnType<typeof vi.fn>;
}

export function createMockTemplateRegistry(): MockTemplateRegistry {
  return {
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
    listCategories: vi.fn(),
  };
}

interface MockTaskTemplateRegistry {
  getTemplate: ReturnType<typeof vi.fn>;
  listTemplates: ReturnType<typeof vi.fn>;
}

export function createMockTaskTemplateRegistry(): MockTaskTemplateRegistry {
  return {
    getTemplate: vi.fn(),
    listTemplates: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// TaskSyncer
// ---------------------------------------------------------------------------

interface MockTaskSyncer {
  sync: ReturnType<typeof vi.fn>;
}

export function createMockSyncer(): MockTaskSyncer {
  return {
    sync: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// WorkflowCacheManager
// ---------------------------------------------------------------------------

interface MockWorkflowCacheManager {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  syncProject: ReturnType<typeof vi.fn>;
  syncAll: ReturnType<typeof vi.fn>;
  getProjectWorkflow: ReturnType<typeof vi.fn>;
}

export function createMockWorkflowCacheManager(): MockWorkflowCacheManager {
  return {
    load: vi.fn(),
    save: vi.fn(),
    syncProject: vi.fn(),
    syncAll: vi.fn(),
    getProjectWorkflow: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// UserCacheManager
// ---------------------------------------------------------------------------

interface MockUserCacheManager {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  syncInstance: ReturnType<typeof vi.fn>;
  syncAll: ReturnType<typeof vi.fn>;
  resolveEmail: ReturnType<typeof vi.fn>;
  getAllUsers: ReturnType<typeof vi.fn>;
}

export function createMockUserCacheManager(): MockUserCacheManager {
  return {
    load: vi.fn(),
    save: vi.fn(),
    syncInstance: vi.fn(),
    syncAll: vi.fn(),
    resolveEmail: vi.fn(),
    getAllUsers: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Type casts for use with dependency injection
// ---------------------------------------------------------------------------

export function asCacheManager(mock: MockCacheManager): CacheManager {
  return mock as unknown as CacheManager;
}

export function asConnector(mock: MockJiraConnector): JiraConnector {
  return mock as unknown as JiraConnector;
}

export function asPool(mock: MockInstancePool): InstancePool {
  return mock as unknown as InstancePool;
}

export function asRegistry(mock: MockTemplateRegistry): TemplateRegistry {
  return mock as unknown as TemplateRegistry;
}

export function asTaskRegistry(
  mock: MockTaskTemplateRegistry,
): TaskTemplateRegistry {
  return mock as unknown as TaskTemplateRegistry;
}

export function asSyncer(mock: MockTaskSyncer): TaskSyncer {
  return mock as unknown as TaskSyncer;
}

export function asWorkflowCacheManager(
  mock: MockWorkflowCacheManager,
): WorkflowCacheManager {
  return mock as unknown as WorkflowCacheManager;
}

export function asUserCacheManager(
  mock: MockUserCacheManager,
): UserCacheManager {
  return mock as unknown as UserCacheManager;
}
