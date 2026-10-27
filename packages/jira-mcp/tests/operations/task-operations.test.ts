// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for TaskOperations business logic.
 */

import { describe, it, expect, vi } from 'vitest';

import { TaskOperations } from '../../src/operations/task-operations';
import {
  JiraConnectionError,
  OwnershipError,
  CommentNotFoundError,
  TaskNotFoundError,
} from '@softspark/atlassian-mcp-core';
import {
  createMockConnector,
  createMockCacheManager,
  asConnector,
  asCacheManager,
} from '../fixtures/mocks';
import { createTaskData } from '../fixtures/tasks';
import { createSimpleAdfDoc } from '@softspark/atlassian-mcp-core/test-fixtures';

// Mock ADF conversion, which now lives in the shared core package. Everything
// else core exports (the error classes this file asserts on) is spread through.
vi.mock('@softspark/atlassian-mcp-core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    markdownToAdf: vi.fn().mockReturnValue({
      version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'mocked' }] }],
    }),
    adfToMarkdown: vi.fn().mockReturnValue('# Mocked markdown'),
  };
});

vi.mock('../../src/connector/time-parser', () => ({
  parseTimeSpent: vi.fn().mockReturnValue(9000),
}));

describe('TaskOperations', () => {
  function createOps() {
    const connector = createMockConnector();
    const cache = createMockCacheManager();
    const ops = new TaskOperations(
      asConnector(connector),
      asCacheManager(cache),
    );
    return { ops, connector, cache };
  }

  // -----------------------------------------------------------------------
  // changeStatus
  // -----------------------------------------------------------------------

  describe('changeStatus', () => {
    it('finds matching transition, executes it, and updates cache', async () => {
      const { ops, connector, cache } = createOps();
      const updatedTask = createTaskData({ status: 'In Progress' });

      connector.getTransitions.mockResolvedValue([
        { id: '11', name: 'Start Progress', toStatus: 'In Progress' },
        { id: '21', name: 'Done', toStatus: 'Done' },
      ]);
      connector.doTransition.mockResolvedValue(undefined);
      cache.updateTask.mockResolvedValue(updatedTask);

      const result = await ops.changeStatus('PROJ-1', 'Start Progress');

      expect(connector.getTransitions).toHaveBeenCalledWith('PROJ-1');
      expect(connector.doTransition).toHaveBeenCalledWith('PROJ-1', '11');
      expect(cache.updateTask).toHaveBeenCalledWith('PROJ-1', {
        status: 'In Progress',
      });
      expect(result.taskKey).toBe('PROJ-1');
      expect(result.updatedTask).toBe(updatedTask);
    });

    it('matches transition name case-insensitively', async () => {
      const { ops, connector, cache } = createOps();
      const updatedTask = createTaskData({ status: 'Done' });

      connector.getTransitions.mockResolvedValue([
        { id: '21', name: 'Done', toStatus: 'Done' },
      ]);
      connector.doTransition.mockResolvedValue(undefined);
      cache.updateTask.mockResolvedValue(updatedTask);

      await ops.changeStatus('PROJ-1', 'done');

      expect(connector.doTransition).toHaveBeenCalledWith('PROJ-1', '21');
    });

    it('throws JiraConnectionError when no matching transition', async () => {
      const { ops, connector } = createOps();

      connector.getTransitions.mockResolvedValue([
        { id: '11', name: 'Start Progress', toStatus: 'In Progress' },
      ]);

      await expect(
        ops.changeStatus('PROJ-1', 'Nonexistent'),
      ).rejects.toThrow(JiraConnectionError);
    });

    it('includes available transitions in error message', async () => {
      const { ops, connector } = createOps();

      connector.getTransitions.mockResolvedValue([
        { id: '11', name: 'Start Progress', toStatus: 'In Progress' },
        { id: '21', name: 'Done', toStatus: 'Done' },
      ]);

      await expect(
        ops.changeStatus('PROJ-1', 'Invalid'),
      ).rejects.toThrow(/Start Progress -> In Progress/);
    });

    it('recovers from cache miss by fetching from Jira and upserting', async () => {
      const { ops, connector, cache } = createOps();

      connector.getTransitions.mockResolvedValue([
        { id: '11', name: 'Start Progress', toStatus: 'In Progress' },
      ]);
      connector.doTransition.mockResolvedValue(undefined);
      cache.updateTask.mockRejectedValue(new TaskNotFoundError('Not in cache'));
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Fresh from Jira',
        description: null,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        reporter: 'reporter@example.com',
        status: 'To Do',
        assignee: 'user@example.com',
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      cache.upsertTask.mockImplementation(async (t) => t);

      const result = await ops.changeStatus('PROJ-1', 'Start Progress');

      expect(connector.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(cache.upsertTask).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'PROJ-1',
          status: 'In Progress', // updates override the refreshed Jira state
          summary: 'Fresh from Jira',
          creator: 'creator@example.com',
          reporter: 'reporter@example.com',
          project_url: 'https://test.atlassian.net',
          epic_link: null,
        }),
      );
      expect(result.updatedTask.status).toBe('In Progress');
    });
  });

  // -----------------------------------------------------------------------
  // getAvailableStatuses
  // -----------------------------------------------------------------------

  describe('getAvailableStatuses', () => {
    it('returns mapped transitions from connector', async () => {
      const { ops, connector } = createOps();

      connector.getTransitions.mockResolvedValue([
        { id: '11', name: 'Start', toStatus: 'In Progress' },
      ]);

      const statuses = await ops.getAvailableStatuses('PROJ-1');

      expect(statuses).toEqual([
        { id: '11', name: 'Start', toStatus: 'In Progress' },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // addComment
  // -----------------------------------------------------------------------

  describe('addComment', () => {
    it('converts markdown to ADF and sends to connector', async () => {
      const { ops, connector } = createOps();

      const adfBody = createSimpleAdfDoc('Response ADF');
      connector.addComment.mockResolvedValue({
        id: 'c-1',
        author: 'user@example.com',
        authorAccountId: 'user-account-1',
        body: adfBody,
        created: '2026-01-01T00:00:00.000Z',
        visibility: null,
      });

      connector.getProjectTypeKey.mockResolvedValue('software');

      const result = await ops.addComment('PROJ-1', '# My comment');

      expect(connector.addComment).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ type: 'doc' }),
        {},
      );
      expect(result.commentId).toBe('c-1');
      expect(result.author).toBe('user@example.com');
      // adfToMarkdown is mocked
      expect(result.bodyMarkdown).toBe('# Mocked markdown');
      expect(result.visibility).toBeNull();
      expect(result.internal).toBe(false);
    });

    describe('without an explicit internal flag in a service project', () => {
      function serviceOps() {
        const created = createOps();
        created.connector.getProjectTypeKey.mockResolvedValue('service_desk');
        created.connector.addComment.mockResolvedValue({
          id: 'c-9',
          author: 'agent@example.com',
          authorAccountId: 'agent-1',
          body: createSimpleAdfDoc('Note'),
          created: '2026-01-01T00:00:00.000Z',
          visibility: null,
        });
        return created;
      }

      it('posts a public reply when the project sets no default, as before the setting existed', async () => {
        const { ops, connector } = serviceOps();

        const result = await ops.addComment('SD-1', 'Note');

        expect(connector.addComment).toHaveBeenCalledWith('SD-1', expect.anything(), {});
        expect(result.internal).toBe(false);
      });

      it('posts an internal note when the project default is internal', async () => {
        const { ops, connector } = serviceOps();

        const result = await ops.addComment('SD-1', 'Note', { serviceDefault: 'internal' });

        expect(connector.addComment).toHaveBeenCalledWith('SD-1', expect.anything(), {
          internal: true,
        });
        expect(result.internal).toBe(true);
      });

      it('lets an explicit internal: true override a public default', async () => {
        const { ops, connector } = serviceOps();

        await ops.addComment('SD-1', 'Note', { internal: true, serviceDefault: 'public' });

        expect(connector.addComment).toHaveBeenCalledWith('SD-1', expect.anything(), {
          internal: true,
        });
      });

      it('lets an explicit internal: false override an internal default without asking the project type', async () => {
        const { ops, connector } = serviceOps();

        const result = await ops.addComment('SD-1', 'Note', {
          internal: false,
          serviceDefault: 'internal',
        });

        expect(connector.getProjectTypeKey).not.toHaveBeenCalled();
        expect(connector.addComment).toHaveBeenCalledWith('SD-1', expect.anything(), {});
        expect(result.internal).toBe(false);
      });
    });

    it('ignores an internal default outside a service project', async () => {
      const { ops, connector } = createOps();
      connector.getProjectTypeKey.mockResolvedValue('business');
      connector.addComment.mockResolvedValue({
        id: 'c-10',
        author: 'user@example.com',
        authorAccountId: 'user-account-1',
        body: createSimpleAdfDoc('Note'),
        created: '2026-01-01T00:00:00.000Z',
        visibility: null,
      });

      const result = await ops.addComment('BIZ-1', 'Note', { serviceDefault: 'internal' });

      expect(connector.addComment).toHaveBeenCalledWith('BIZ-1', expect.anything(), {});
      expect(result.internal).toBe(false);
    });

    it('posts an internal note in a service project', async () => {
      const { ops, connector } = createOps();
      connector.getProjectTypeKey.mockResolvedValue('service_desk');
      connector.addComment.mockResolvedValue({
        id: 'c-3',
        author: 'agent@example.com',
        authorAccountId: 'agent-1',
        body: createSimpleAdfDoc('Internal'),
        created: '2026-01-01T00:00:00.000Z',
        visibility: null,
      });

      const result = await ops.addComment('SD-7', 'Internal', { internal: true });

      expect(connector.getProjectTypeKey).toHaveBeenCalledWith('SD');
      expect(connector.addComment).toHaveBeenCalledWith(
        'SD-7',
        expect.objectContaining({ type: 'doc' }),
        { internal: true },
      );
      expect(result.internal).toBe(true);
    });

    it('refuses an internal note outside a service project and posts nothing', async () => {
      const { ops, connector } = createOps();
      connector.getProjectTypeKey.mockResolvedValue('software');

      await expect(ops.addComment('PROJ-1', 'Internal', { internal: true })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        message: expect.stringContaining('PROJ is software'),
      });
      expect(connector.addComment).not.toHaveBeenCalled();
    });

    it('passes visibility to the connector and returns what Jira stored', async () => {
      const { ops, connector } = createOps();
      const visibility = { type: 'group' as const, value: 'jira-developers' };
      connector.getProjectTypeKey.mockResolvedValue('software');

      connector.addComment.mockResolvedValue({
        id: 'c-2',
        author: 'user@example.com',
        authorAccountId: 'user-account-1',
        body: createSimpleAdfDoc('Internal'),
        created: '2026-01-01T00:00:00.000Z',
        visibility: { ...visibility, identifier: 'group-id-1' },
      });

      const result = await ops.addComment('PROJ-1', 'Internal', { visibility });

      expect(connector.addComment).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ type: 'doc' }),
        { visibility },
      );
      expect(result.visibility).toEqual({
        type: 'group',
        value: 'jira-developers',
        identifier: 'group-id-1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // reassign
  // -----------------------------------------------------------------------

  describe('reassign', () => {
    it('looks up user and assigns when email is provided', async () => {
      const { ops, connector, cache } = createOps();
      const updatedTask = createTaskData({ assignee: 'new@example.com' });

      connector.findUser.mockResolvedValue('account-id-123');
      connector.assignIssue.mockResolvedValue(undefined);
      cache.updateTask.mockResolvedValue(updatedTask);

      const result = await ops.reassign('PROJ-1', 'new@example.com');

      expect(connector.findUser).toHaveBeenCalledWith('new@example.com');
      expect(connector.assignIssue).toHaveBeenCalledWith(
        'PROJ-1',
        'account-id-123',
      );
      expect(cache.updateTask).toHaveBeenCalledWith('PROJ-1', {
        assignee: 'new@example.com',
      });
      expect(result.updatedTask).toBe(updatedTask);
    });

    it('unassigns when email is null', async () => {
      const { ops, connector, cache } = createOps();
      const updatedTask = createTaskData({ assignee: null });

      connector.assignIssue.mockResolvedValue(undefined);
      cache.updateTask.mockResolvedValue(updatedTask);

      const result = await ops.reassign('PROJ-1', null);

      expect(connector.findUser).not.toHaveBeenCalled();
      expect(connector.assignIssue).toHaveBeenCalledWith('PROJ-1', null);
      expect(cache.updateTask).toHaveBeenCalledWith('PROJ-1', {
        assignee: null,
      });
      expect(result.updatedTask.assignee).toBeNull();
    });

    it('recovers from cache miss by fetching from Jira and upserting', async () => {
      const { ops, connector, cache } = createOps();

      connector.findUser.mockResolvedValue('account-id-123');
      connector.assignIssue.mockResolvedValue(undefined);
      cache.updateTask.mockRejectedValue(new TaskNotFoundError('Not in cache'));
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Fresh from Jira',
        description: null,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        status: 'In Progress',
        assignee: 'previous@example.com',
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      cache.upsertTask.mockImplementation(async (t) => t);

      const result = await ops.reassign('PROJ-1', 'new@example.com');

      expect(connector.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(cache.upsertTask).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'PROJ-1',
          assignee: 'new@example.com', // update overrides the prior Jira value
          status: 'In Progress',
          project_url: 'https://test.atlassian.net',
        }),
      );
      expect(result.updatedTask.assignee).toBe('new@example.com');
    });
  });

  // -----------------------------------------------------------------------
  // getTaskDetails
  // -----------------------------------------------------------------------

  describe('getTaskDetails', () => {
    it('fetches issue and converts ADF description and comments to markdown', async () => {
      const { ops, connector } = createOps();
      const adfDescription = createSimpleAdfDoc('Description body');
      const adfComment = createSimpleAdfDoc('Comment body');

      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: adfDescription,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        reporter: 'reporter@example.com',
        status: 'To Do',
        assignee: 'user@example.com',
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [
          {
            id: 'c-1',
            author: 'commenter@example.com',
            authorAccountId: 'commenter-1',
            body: adfComment,
            created: '2026-01-02T00:00:00.000Z',
            visibility: { type: 'role', value: 'Developers' },
          },
        ],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });

      connector.getInternalCommentIds.mockResolvedValue(new Set(['c-1']));

      const details = await ops.getTaskDetails('PROJ-1');

      expect(connector.getInternalCommentIds).toHaveBeenCalledWith('PROJ-1');
      expect(details.comments[0]!.internal).toBe(true);
      expect(details.key).toBe('PROJ-1');
      expect(details.creator).toBe('creator@example.com');
      expect(details.reporter).toBe('reporter@example.com');
      // adfToMarkdown is mocked
      expect(details.description).toBe('# Mocked markdown');
      expect(details.comments).toHaveLength(1);
      expect(details.comments[0]!.author).toBe('commenter@example.com');
      expect(details.comments[0]!.body).toBe('# Mocked markdown');
      expect(details.comments[0]!.visibility).toEqual({ type: 'role', value: 'Developers' });
    });
  });

  // -----------------------------------------------------------------------
  // deleteComment
  // -----------------------------------------------------------------------

  describe('deleteComment', () => {
    it('deletes a comment when current user is the author', async () => {
      const { ops, connector } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [
          {
            id: 'c-1',
            author: 'user@example.com',
            authorAccountId: 'user-account-1',
            body: null,
            created: '2026-01-02T00:00:00.000Z',
          },
        ],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      connector.deleteComment.mockResolvedValue(undefined);

      const result = await ops.deleteComment('PROJ-1', 'c-1');

      expect(connector.getCurrentUser).toHaveBeenCalled();
      expect(connector.deleteComment).toHaveBeenCalledWith('PROJ-1', 'c-1');
      expect(result).toEqual({ taskKey: 'PROJ-1', commentId: 'c-1' });
    });

    it('throws OwnershipError when current user is not the comment author', async () => {
      const { ops, connector } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [
          {
            id: 'c-1',
            author: 'other@example.com',
            authorAccountId: 'other-account',
            body: null,
            created: '2026-01-02T00:00:00.000Z',
          },
        ],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });

      await expect(ops.deleteComment('PROJ-1', 'c-1')).rejects.toThrow(OwnershipError);
      expect(connector.deleteComment).not.toHaveBeenCalled();
    });

    it('throws CommentNotFoundError when comment does not exist on the issue', async () => {
      const { ops, connector } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'creator@example.com',
        creatorAccountId: 'creator-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });

      await expect(ops.deleteComment('PROJ-1', 'c-404')).rejects.toThrow(CommentNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // deleteTask
  // -----------------------------------------------------------------------

  describe('deleteTask', () => {
    it('deletes a task when current user is the creator and invalidates cache', async () => {
      const { ops, connector, cache } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'user@example.com',
        creatorAccountId: 'user-account-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      connector.deleteIssue.mockResolvedValue(undefined);
      cache.deleteTask.mockResolvedValue(undefined);

      const result = await ops.deleteTask('PROJ-1');

      expect(connector.deleteIssue).toHaveBeenCalledWith('PROJ-1');
      expect(cache.deleteTask).toHaveBeenCalledWith('PROJ-1');
      expect(result).toEqual({ taskKey: 'PROJ-1' });
    });

    it('throws OwnershipError when current user did not create the task', async () => {
      const { ops, connector } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'other@example.com',
        creatorAccountId: 'other-account',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });

      await expect(ops.deleteTask('PROJ-1')).rejects.toThrow(OwnershipError);
      expect(connector.deleteIssue).not.toHaveBeenCalled();
    });

    it('tolerates missing cache entry on delete', async () => {
      const { ops, connector, cache } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'user@example.com',
        creatorAccountId: 'user-account-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      connector.deleteIssue.mockResolvedValue(undefined);
      cache.deleteTask.mockRejectedValue(new TaskNotFoundError('Not in cache'));

      const result = await ops.deleteTask('PROJ-1');
      expect(result).toEqual({ taskKey: 'PROJ-1' });
    });

    it('propagates unexpected cache errors on delete', async () => {
      const { ops, connector, cache } = createOps();

      connector.getCurrentUser.mockResolvedValue({
        accountId: 'user-account-1',
        emailAddress: 'user@example.com',
        displayName: 'User',
        active: true,
      });
      connector.getIssue.mockResolvedValue({
        key: 'PROJ-1',
        summary: 'Test task',
        description: null,
        creator: 'user@example.com',
        creatorAccountId: 'user-account-1',
        status: 'To Do',
        assignee: null,
        priority: 'Medium',
        issueType: 'Task',
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        projectKey: 'PROJ',
        comments: [],
        timeTracking: {
          originalEstimate: null,
          remainingEstimate: null,
          timeSpent: null,
          originalEstimateSeconds: null,
          remainingEstimateSeconds: null,
          timeSpentSeconds: null,
        },
      });
      connector.deleteIssue.mockResolvedValue(undefined);
      cache.deleteTask.mockRejectedValue(new Error('Disk I/O failure'));

      await expect(ops.deleteTask('PROJ-1')).rejects.toThrow('Disk I/O failure');
    });
  });

  // -----------------------------------------------------------------------
  // logTime
  // -----------------------------------------------------------------------

  describe('logTime', () => {
    it('parses time, sends worklog, and invalidates cache', async () => {
      const { ops, connector, cache } = createOps();

      connector.addWorklog.mockResolvedValue({
        id: 'wl-1',
        timeSpent: '2h 30m',
        timeSpentSeconds: 9000,
        created: '2026-01-01T00:00:00.000Z',
      });
      cache.deleteTask.mockResolvedValue(undefined);

      const result = await ops.logTime('PROJ-1', '2h 30m');

      expect(connector.addWorklog).toHaveBeenCalledWith('PROJ-1', 9000, {});
      expect(cache.deleteTask).toHaveBeenCalledWith('PROJ-1');
      expect(result.worklogId).toBe('wl-1');
      expect(result.timeSpent).toBe('2h 30m');
      expect(result.timeSpentSeconds).toBe(9000);
    });

    it('includes ADF comment when provided', async () => {
      const { ops, connector, cache } = createOps();

      connector.addWorklog.mockResolvedValue({
        id: 'wl-2',
        timeSpent: '1h',
        timeSpentSeconds: 3600,
        created: '2026-01-01T00:00:00.000Z',
      });
      cache.deleteTask.mockResolvedValue(undefined);

      await ops.logTime('PROJ-1', '1h', { comment: 'Work description' });

      // markdownToAdf is mocked, so the second call passes the ADF doc
      expect(connector.addWorklog).toHaveBeenCalledWith('PROJ-1', 9000, {
        comment: expect.objectContaining({ type: 'doc' }),
      });
    });

    it('passes visibility to the connector and returns it', async () => {
      const { ops, connector, cache } = createOps();
      const visibility = { type: 'role' as const, value: 'Administrators' };

      connector.addWorklog.mockResolvedValue({
        id: 'wl-5',
        timeSpent: '1h',
        timeSpentSeconds: 3600,
        created: '2026-01-01T00:00:00.000Z',
        visibility,
      });
      cache.deleteTask.mockResolvedValue(undefined);

      const result = await ops.logTime('PROJ-1', '1h', { visibility });

      expect(connector.addWorklog).toHaveBeenCalledWith('PROJ-1', 9000, { visibility });
      expect(result.visibility).toEqual(visibility);
    });

    it('tolerates missing cache entry on delete', async () => {
      const { ops, connector, cache } = createOps();

      connector.addWorklog.mockResolvedValue({
        id: 'wl-3',
        timeSpent: '30m',
        timeSpentSeconds: 1800,
        created: '2026-01-01T00:00:00.000Z',
      });
      cache.deleteTask.mockRejectedValue(new TaskNotFoundError('Not in cache'));

      // Should not throw
      const result = await ops.logTime('PROJ-1', '30m');
      expect(result.worklogId).toBe('wl-3');
    });

    it('propagates unexpected cache errors on delete', async () => {
      const { ops, connector, cache } = createOps();

      connector.addWorklog.mockResolvedValue({
        id: 'wl-4',
        timeSpent: '30m',
        timeSpentSeconds: 1800,
        created: '2026-01-01T00:00:00.000Z',
      });
      cache.deleteTask.mockRejectedValue(new Error('Disk I/O failure'));

      await expect(ops.logTime('PROJ-1', '30m')).rejects.toThrow('Disk I/O failure');
    });
  });

  // -----------------------------------------------------------------------
  // getTimeTracking
  // -----------------------------------------------------------------------

  describe('getTimeTracking', () => {
    it('returns time tracking info from connector', async () => {
      const { ops, connector } = createOps();

      connector.getTimeTracking.mockResolvedValue({
        originalEstimate: '8h',
        remainingEstimate: '5h 30m',
        timeSpent: '2h 30m',
        originalEstimateSeconds: 28800,
        remainingEstimateSeconds: 19800,
        timeSpentSeconds: 9000,
      });

      const result = await ops.getTimeTracking('PROJ-1');

      expect(result.taskKey).toBe('PROJ-1');
      expect(result.originalEstimate).toBe('8h');
      expect(result.remainingEstimate).toBe('5h 30m');
      expect(result.timeSpent).toBe('2h 30m');
    });

    it('returns null values when nothing is tracked', async () => {
      const { ops, connector } = createOps();

      connector.getTimeTracking.mockResolvedValue({
        originalEstimate: null,
        remainingEstimate: null,
        timeSpent: null,
        originalEstimateSeconds: null,
        remainingEstimateSeconds: null,
        timeSpentSeconds: null,
      });

      const result = await ops.getTimeTracking('PROJ-1');

      expect(result.originalEstimate).toBeNull();
      expect(result.timeSpent).toBeNull();
    });
  });
});
