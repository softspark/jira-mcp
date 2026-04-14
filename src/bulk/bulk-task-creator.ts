/**
 * Bulk task creation engine for Jira.
 *
 * Orchestrates batch creation/update of Jira issues under a single epic
 * with rate limiting, assignee caching, bilingual support, and detailed
 * error reporting. Each task is processed sequentially to respect Jira
 * API rate limits.
 *
 * Ported from the Python MVP `BulkTaskCreator`.
 *
 * @module
 */

import type { JiraConnector } from '../connector/jira-connector.js';
import type { JiraField } from '../connector/types.js';
import type { LanguageCode } from '../config/schema.js';
import { DEFAULT_LANGUAGE } from '../config/schema.js';
import type { BulkConfig, BulkOptions, BulkResult, TaskAction, TaskConfig, TaskResult } from './types.js';
import { markdownToAdf } from '../adf/markdown-to-adf.js';
import { JiraConnectionError, JiraMcpError } from '../errors/index.js';
import { escapeJql } from '../utils/jql.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for the given number of milliseconds.
 *
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// ---------------------------------------------------------------------------
// Error subclasses
// ---------------------------------------------------------------------------

/** Raised when the target epic does not exist or is not accessible. */
export class EpicNotFoundError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'EPIC_NOT_FOUND');
    this.name = 'EpicNotFoundError';
  }
}

/** Raised when the Epic Link custom field cannot be discovered. */
export class EpicLinkFieldNotFoundError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'EPIC_LINK_FIELD_NOT_FOUND');
    this.name = 'EpicLinkFieldNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// BulkTaskCreator
// ---------------------------------------------------------------------------

/**
 * Creates or updates multiple Jira tasks under an epic.
 *
 * Handles epic validation, Epic Link field discovery, assignee resolution
 * with caching, sequential task processing with rate limiting, bilingual
 * summary/description selection, and detailed per-task error reporting.
 */
export class BulkTaskCreator {
  private epicLinkFieldId: string | null = null;
  private readonly assigneeCache = new Map<string, string>();

  constructor(
    private readonly connector: JiraConnector,
    private readonly projectKey: string,
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a bulk task creation/update operation.
   *
   * Steps:
   * 1. Start timer
   * 2. Validate the epic exists
   * 3. Discover the Epic Link custom field ID
   * 4. Pre-resolve unique assignee emails to account IDs
   * 5. Process each task sequentially (with rate limiting)
   * 6. Build and return the aggregate result
   *
   * @param config - Validated bulk configuration.
   * @returns Aggregate result with per-task outcomes and timing.
   */
  async execute(config: BulkConfig): Promise<BulkResult> {
    const startMs = Date.now();

    const epicKey = config.epic_key;
    const options = config.options;

    // Step 1 -- validate epic
    const epicExists = await this.validateEpic(epicKey);
    if (!epicExists) {
      throw new EpicNotFoundError(
        `Epic '${epicKey}' not found or not accessible`,
      );
    }

    // Step 2 -- discover Epic Link field
    this.epicLinkFieldId = await this.discoverEpicLinkField();

    // Step 3 -- pre-resolve unique assignees
    const uniqueEmails = new Set<string>();
    for (const task of config.tasks) {
      if (task.assignee) {
        uniqueEmails.add(task.assignee);
      }
    }
    for (const email of uniqueEmails) {
      try {
        await this.resolveAssignee(email);
      } catch {
        // Resolution failure is non-fatal here; the individual task will
        // report the error when it tries to use the unresolved email.
      }
    }

    // Step 4 -- process tasks sequentially
    const results: TaskResult[] = [];

    for (let i = 0; i < config.tasks.length; i++) {
      // Rate-limit between tasks (skip first)
      if (i > 0 && options.rate_limit_ms > 0) {
        await sleep(options.rate_limit_ms);
      }

      const task = config.tasks[i];
      if (!task) continue;
      const taskResult = await this.processTask(task, epicKey, options);
      results.push(taskResult);
    }

    // Step 5 -- aggregate summary
    const summary = buildSummary(results);
    const totalTimeMs = Date.now() - startMs;

    return {
      results,
      summary,
      dry_run: options.dry_run,
      total_time_ms: totalTimeMs,
    };
  }

  // -----------------------------------------------------------------------
  // Epic validation
  // -----------------------------------------------------------------------

  /**
   * Check whether the epic issue exists and is accessible.
   *
   * @param epicKey - Issue key (e.g. "PROJ-123").
   * @returns `true` if the epic is reachable.
   */
  private async validateEpic(epicKey: string): Promise<boolean> {
    try {
      await this.connector.getIssue(epicKey);
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Epic Link field discovery
  // -----------------------------------------------------------------------

  /**
   * Discover the custom field ID used for "Epic Link".
   *
   * Jira uses a per-instance custom field ID; this method inspects all
   * field definitions to locate it by name or schema type.
   *
   * @returns Custom field ID (e.g. "customfield_10014").
   * @throws {EpicLinkFieldNotFoundError} When the field cannot be found.
   */
  private async discoverEpicLinkField(): Promise<string> {
    let fields: JiraField[];
    try {
      fields = await this.connector.getFields();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new EpicLinkFieldNotFoundError(
        `Failed to fetch fields from Jira: ${message}`,
      );
    }

    for (const field of fields) {
      const nameLower = field.name.toLowerCase();

      // Match by canonical name
      if (nameLower.includes('epic link')) {
        return field.id;
      }

      // Match by schema custom type
      const customSchema = field.schema?.custom ?? '';
      if (
        customSchema.includes('epic-link') ||
        customSchema.includes('gh-epic-link')
      ) {
        return field.id;
      }
    }

    throw new EpicLinkFieldNotFoundError(
      'Epic Link custom field not found. Ensure Jira instance has Epic support enabled.',
    );
  }

  // -----------------------------------------------------------------------
  // Assignee resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve an email address to a Jira account ID.
   *
   * Results are cached so repeated lookups for the same email are free.
   *
   * @param email - User email address.
   * @returns Jira account ID.
   * @throws {JiraConnectionError} When the user cannot be found.
   */
  private async resolveAssignee(email: string): Promise<string> {
    const cached = this.assigneeCache.get(email);
    if (cached !== undefined) {
      return cached;
    }

    const accountId = await this.connector.findUser(email);
    this.assigneeCache.set(email, accountId);
    return accountId;
  }

  // -----------------------------------------------------------------------
  // Single-task processing
  // -----------------------------------------------------------------------

  /**
   * Process a single task -- create, update, skip, or preview.
   *
   * Errors are caught so that one failing task does not abort the batch.
   *
   * @param task      - Task configuration.
   * @param epicKey   - Parent epic key.
   * @param options   - Bulk operation options.
   * @returns Per-task result.
   */
  private async processTask(
    task: TaskConfig,
    epicKey: string,
    options: BulkOptions,
  ): Promise<TaskResult> {
    const effectiveSummary = this.selectSummary(task, options.language);

    // Dry-run mode -- produce a preview without API calls
    if (options.dry_run) {
      return {
        summary: effectiveSummary,
        issue_key: null,
        action: 'preview',
        error: null,
        url: null,
      };
    }

    try {
      // Check for existing issue
      const existingKey = await this.findExistingTask(
        effectiveSummary,
        this.projectKey,
      );

      if (existingKey !== null) {
        if (options.update_existing) {
          await this.updateTask(
            existingKey,
            task,
            epicKey,
            this.epicLinkFieldId,
            options,
          );
          return {
            summary: effectiveSummary,
            issue_key: existingKey,
            action: 'updated',
            error: null,
            url: `${this.connector.instanceUrl}/browse/${existingKey}`,
          };
        }

        // Task exists but update_existing is false -- skip
        return {
          summary: effectiveSummary,
          issue_key: existingKey,
          action: 'skipped',
          error: null,
          url: `${this.connector.instanceUrl}/browse/${existingKey}`,
        };
      }

      // Create new task
      const created = await this.createTask(
        task,
        epicKey,
        this.epicLinkFieldId,
        options,
      );

      // Transition to target status if specified
      if (task.status) {
        await this.setStatus(created.key, task.status);
      }

      // Force re-assign to override Jira automation rules
      if (options.force_reassign && task.assignee) {
        await this.forceReassign(
          created.key,
          task.assignee,
          options.reassign_delay_ms,
        );
      }

      return {
        summary: effectiveSummary,
        issue_key: created.key,
        action: 'created',
        error: null,
        url: created.url,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        summary: effectiveSummary,
        issue_key: null,
        action: 'failed',
        error: message,
        url: null,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Task creation
  // -----------------------------------------------------------------------

  /**
   * Create a single Jira issue with all configured fields.
   *
   * @param task             - Task configuration.
   * @param epicKey          - Parent epic key.
   * @param epicLinkFieldId  - Custom field ID for Epic Link.
   * @param options          - Bulk options (language, etc.).
   * @returns Created issue metadata.
   */
  private async createTask(
    task: TaskConfig,
    epicKey: string,
    epicLinkFieldId: string | null,
    options: BulkOptions,
  ): Promise<{ readonly key: string; readonly url: string }> {
    const effectiveSummary = this.selectSummary(task, options.language);
    const effectiveDescription = this.selectDescription(
      task,
      options.language,
    );

    const fields: Record<string, unknown> = {
      project: { key: this.projectKey },
      summary: effectiveSummary,
      issuetype: { name: task.type ?? 'Task' },
      priority: { name: task.priority ?? 'Medium' },
    };

    if (effectiveDescription) {
      fields['description'] = markdownToAdf(effectiveDescription);
    }

    if (task.labels && task.labels.length > 0) {
      fields['labels'] = [...task.labels];
    }

    if (task.estimate_hours) {
      fields['timetracking'] = {
        originalEstimate: `${task.estimate_hours}h`,
      };
    }

    // Assignee
    if (task.assignee) {
      const accountId = this.assigneeCache.get(task.assignee);
      if (accountId !== undefined) {
        fields['assignee'] = { accountId };
      } else {
        throw new JiraConnectionError(
          `Assignee not resolved: ${task.assignee}`,
        );
      }
    }

    // Epic Link
    if (epicLinkFieldId) {
      fields[epicLinkFieldId] = epicKey;
    }

    const result = await this.connector.createIssue(fields);
    return { key: result.key, url: result.url };
  }

  // -----------------------------------------------------------------------
  // Task update
  // -----------------------------------------------------------------------

  /**
   * Update an existing Jira issue with the fields from the task config.
   *
   * @param issueKey         - Existing issue key.
   * @param task             - Task configuration.
   * @param epicKey          - Parent epic key.
   * @param epicLinkFieldId  - Custom field ID for Epic Link.
   * @param options          - Bulk options (language, etc.).
   */
  private async updateTask(
    issueKey: string,
    task: TaskConfig,
    epicKey: string,
    epicLinkFieldId: string | null,
    options: BulkOptions,
  ): Promise<void> {
    const effectiveDescription = this.selectDescription(
      task,
      options.language,
    );

    const fields: Record<string, unknown> = {};

    if (effectiveDescription) {
      fields['description'] = markdownToAdf(effectiveDescription);
    }

    if (task.priority) {
      fields['priority'] = { name: task.priority };
    }

    if (task.labels && task.labels.length > 0) {
      fields['labels'] = [...task.labels];
    }

    if (task.estimate_hours) {
      fields['timetracking'] = {
        originalEstimate: `${task.estimate_hours}h`,
      };
    }

    if (task.assignee) {
      const accountId = this.assigneeCache.get(task.assignee);
      if (accountId !== undefined) {
        fields['assignee'] = { accountId };
      }
    }

    if (epicLinkFieldId) {
      fields[epicLinkFieldId] = epicKey;
    }

    if (Object.keys(fields).length > 0) {
      await this.connector.updateIssue(issueKey, fields);
    }

    // Transition status if requested
    if (task.status) {
      await this.setStatus(issueKey, task.status);
    }
  }

  // -----------------------------------------------------------------------
  // Search for existing tasks
  // -----------------------------------------------------------------------

  /**
   * Search for an existing task by summary in the project.
   *
   * @param summary    - Exact summary text to match.
   * @param projectKey - Jira project key.
   * @returns Issue key if found, `null` otherwise.
   */
  private async findExistingTask(
    summary: string,
    projectKey: string,
  ): Promise<string | null> {
    try {
      const escapedSummary = escapeJql(summary);
      const jql = `project = "${projectKey}" AND summary = "${escapedSummary}"`;

      const issues = await this.connector.searchIssues(jql);
      const first = issues[0];
      if (first) {
        return first.key;
      }
      return null;
    } catch {
      // Search failure treated as "not found" -- task will be created
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Status transitions
  // -----------------------------------------------------------------------

  /**
   * Transition an issue to the requested status.
   *
   * Fetches available transitions and executes the one whose target status
   * name matches (case-insensitive). Silently skips if no matching
   * transition is available.
   *
   * @param issueKey   - Issue to transition.
   * @param statusName - Target status name.
   */
  private async setStatus(
    issueKey: string,
    statusName: string,
  ): Promise<void> {
    try {
      const transitions = await this.connector.getTransitions(issueKey);
      const match = transitions.find(
        (t) => t.toStatus.toLowerCase() === statusName.toLowerCase(),
      );

      if (match) {
        await this.connector.doTransition(issueKey, match.id);
      }
    } catch {
      // Transition failure is non-fatal -- the task was already created
    }
  }

  // -----------------------------------------------------------------------
  // Force re-assign
  // -----------------------------------------------------------------------

  /**
   * Re-assign an issue after a delay.
   *
   * This is used to override Jira automation rules that may reset the
   * assignee immediately after issue creation.
   *
   * @param issueKey - Issue to re-assign.
   * @param email    - Assignee email.
   * @param delayMs  - Milliseconds to wait before re-assigning.
   */
  private async forceReassign(
    issueKey: string,
    email: string,
    delayMs: number,
  ): Promise<void> {
    const accountId = this.assigneeCache.get(email);
    if (accountId === undefined) {
      return;
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      await this.connector.assignIssue(issueKey, accountId);
    } catch {
      // Re-assign failure is non-fatal -- task was already created
    }
  }

  // -----------------------------------------------------------------------
  // Bilingual helpers
  // -----------------------------------------------------------------------

  /**
   * Select the appropriate summary based on language preference.
   *
   * Looks for `summary_{lang}` first, falls back to the primary `summary`.
   * Default language ('pl') always uses the primary `summary`.
   */
  private selectSummary(
    task: TaskConfig,
    language: LanguageCode,
  ): string {
    if (language !== DEFAULT_LANGUAGE) {
      const localized = task[`summary_${language}`];
      if (localized) return localized;
    }
    return task.summary;
  }

  /**
   * Select the appropriate description based on language preference.
   *
   * Looks for `description_{lang}` first, falls back to the primary `description`.
   * Returns `undefined` when no description is available.
   */
  private selectDescription(
    task: TaskConfig,
    language: LanguageCode,
  ): string | undefined {
    if (language !== DEFAULT_LANGUAGE) {
      const localized = task[`description_${language}`];
      if (localized) return localized;
    }
    return task.description || undefined;
  }
}

// ---------------------------------------------------------------------------
// Result aggregation
// ---------------------------------------------------------------------------

/**
 * Build summary counts from a flat list of task results.
 */
function buildSummary(results: readonly TaskResult[]): BulkResult['summary'] {
  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  let previewed = 0;

  for (const r of results) {
    const action: TaskAction = r.action;
    switch (action) {
      case 'created':
        created++;
        break;
      case 'updated':
        updated++;
        break;
      case 'failed':
        failed++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'preview':
        previewed++;
        break;
    }
  }

  return { created, updated, failed, skipped, previewed };
}
