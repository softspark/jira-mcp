/**
 * Tests for TaskOperations business logic.
 */

import { describe, it, expect, vi } from 'vitest';

import { TaskOperations } from '../../src/operations/task-operations';
import {
  JiraConnectionError,
  OwnershipError,
  CommentNotFoundError,
} from '../../src/errors/index';
import {
  createMockConnector,
  createMockCacheManager,
  asConnector,
  asCacheManager,
} from '../fixtures/mocks';
import { createTaskData } from '../fixtures/tasks';
import { createSimpleAdfDoc } from '../fixtures/adf';

// Mock ADF conversion modules
vi.mock('../../src/adf/markdown-to-adf', () => ({
  markdownToAdf: vi.fn().mockReturnValue({
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'mocked' }] }],
  }),
}));

vi.mock('../../src/adf/adf-to-markdown', () => ({
  adfToMarkdown: vi.fn().mockReturnValue('# Mocked markdown'),
}));

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
      });

      const result = await ops.addComment('PROJ-1', '# My comment');

      expect(connector.addComment).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ type: 'doc' }),
      );
      expect(result.commentId).toBe('c-1');
      expect(result.author).toBe('user@example.com');
      // adfToMarkdown is mocked
      expect(result.bodyMarkdown).toBe('# Mocked markdown');
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

      const details = await ops.getTaskDetails('PROJ-1');

      expect(details.key).toBe('PROJ-1');
      // adfToMarkdown is mocked
      expect(details.description).toBe('# Mocked markdown');
      expect(details.comments).toHaveLength(1);
      expect(details.comments[0]!.author).toBe('commenter@example.com');
      expect(details.comments[0]!.body).toBe('# Mocked markdown');
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

      expect(connector.addWorklog).toHaveBeenCalledWith(
        'PROJ-1',
        9000,
        undefined,
      );
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

      await ops.logTime('PROJ-1', '1h', 'Work description');

      // markdownToAdf is mocked, so the second call passes the ADF doc
      expect(connector.addWorklog).toHaveBeenCalledWith(
        'PROJ-1',
        9000,
        expect.objectContaining({ type: 'doc' }),
      );
    });

    it('tolerates missing cache entry on delete', async () => {
      const { ops, connector, cache } = createOps();

      connector.addWorklog.mockResolvedValue({
        id: 'wl-3',
        timeSpent: '30m',
        timeSpentSeconds: 1800,
        created: '2026-01-01T00:00:00.000Z',
      });
      cache.deleteTask.mockRejectedValue(new Error('Not in cache'));

      // Should not throw
      const result = await ops.logTime('PROJ-1', '30m');
      expect(result.worklogId).toBe('wl-3');
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
