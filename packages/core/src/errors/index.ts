// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Custom error hierarchy for Jira MCP server.
 *
 * All errors extend JiraMcpError which provides a machine-readable `code`
 * property alongside the human-readable `message`.
 *
 * Hierarchy:
 *   JiraMcpError
 *   +-- ConfigError
 *   |   +-- ConfigNotFoundError
 *   |   +-- ConfigValidationError
 *   +-- JiraConnectionError
 *   |   +-- JiraAuthenticationError
 *   |   +-- JiraPermissionError
 *   +-- ConfluenceConnectionError
 *   |   +-- ConfluenceAuthenticationError
 *   |   +-- ConfluencePermissionError
 *   +-- PageNotFoundError
 *   +-- VersionConflictError
 *   +-- MarkupLossError
 *   +-- CacheError
 *   |   +-- CacheNotFoundError
 *   |   +-- CacheCorruptionError
 *   |   +-- TaskNotFoundError
 *   +-- TemplateError
 *   |   +-- TemplateNotFoundError
 *   |   +-- TemplateMissingVariableError
 *   +-- ApprovalError
 *   |   +-- CommentApprovalRequiredError
 *   |   +-- DeletionApprovalRequiredError
 *   +-- AdfConversionError
 *   +-- OwnershipError
 *   +-- CommentNotFoundError
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Root error for every exception raised by this package. */
export class JiraMcpError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JiraMcpError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Config errors
// ---------------------------------------------------------------------------

/** Base class for configuration-related errors. */
export class ConfigError extends JiraMcpError {
  constructor(message: string, code = 'CONFIG_ERROR') {
    super(message, code);
    this.name = 'ConfigError';
  }
}

/**
 * Raised when a required configuration file cannot be found.
 *
 * Examples:
 *  - config.json missing from expected path
 *  - credentials.json missing and no env var override
 */
export class ConfigNotFoundError extends ConfigError {
  constructor(message: string) {
    super(message, 'CONFIG_NOT_FOUND');
    this.name = 'ConfigNotFoundError';
  }
}

/**
 * Raised when configuration content fails validation.
 *
 * Examples:
 *  - Invalid JSON syntax
 *  - Missing required fields
 *  - Invalid URL format
 *  - default_project referencing a non-existent project
 */
export class ConfigValidationError extends ConfigError {
  constructor(message: string) {
    super(message, 'CONFIG_VALIDATION');
    this.name = 'ConfigValidationError';
  }
}

// ---------------------------------------------------------------------------
// Connection errors
// ---------------------------------------------------------------------------

/** Base class for Jira connectivity errors. */
export class JiraConnectionError extends JiraMcpError {
  constructor(message: string, code = 'JIRA_CONNECTION') {
    super(message, code);
    this.name = 'JiraConnectionError';
  }
}

/**
 * Raised when Jira authentication fails.
 *
 * Examples:
 *  - Invalid API token
 *  - Invalid username / email
 *  - Expired token
 */
export class JiraAuthenticationError extends JiraConnectionError {
  constructor(message: string) {
    super(message, 'JIRA_AUTH');
    this.name = 'JiraAuthenticationError';
  }
}

/**
 * Raised when the authenticated user lacks required permissions.
 *
 * Examples:
 *  - No access to a project
 *  - Insufficient role for the requested operation
 */
export class JiraPermissionError extends JiraConnectionError {
  constructor(message: string) {
    super(message, 'JIRA_PERMISSION');
    this.name = 'JiraPermissionError';
  }
}

// ---------------------------------------------------------------------------
// Confluence errors
// ---------------------------------------------------------------------------

/**
 * Base class for Confluence connectivity errors.
 *
 * Kept separate from {@link JiraConnectionError} so a failure names the
 * product that actually rejected the call. The two sit side by side under
 * {@link JiraMcpError} rather than sharing a parent, because renaming the
 * Jira branch would break every consumer matching on its `code`.
 */
export class ConfluenceConnectionError extends JiraMcpError {
  constructor(message: string, code = 'CONFLUENCE_CONNECTION') {
    super(message, code);
    this.name = 'ConfluenceConnectionError';
  }
}

/** Raised when Confluence rejects the supplied credentials. */
export class ConfluenceAuthenticationError extends ConfluenceConnectionError {
  constructor(message: string) {
    super(message, 'CONFLUENCE_AUTH');
    this.name = 'ConfluenceAuthenticationError';
  }
}

/**
 * Raised when the authenticated user lacks Confluence permissions.
 *
 * Confluence answers 404 rather than 403 for a space or page the user may not
 * view, so a "not found" from the API is not proof that the content is absent.
 */
export class ConfluencePermissionError extends ConfluenceConnectionError {
  constructor(message: string) {
    super(message, 'CONFLUENCE_PERMISSION');
    this.name = 'ConfluencePermissionError';
  }
}

/**
 * Raised when a write would silently destroy Confluence storage markup.
 *
 * Macros, layouts, page links and attachment references have no markdown
 * equivalent. Replacing such a body with converted markdown keeps the prose
 * and drops the rest, with nothing in the response to say so, which is why
 * this is refused rather than warned about.
 */
export class MarkupLossError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'MARKUP_LOSS_REFUSED');
    this.name = 'MarkupLossError';
  }
}

/** Raised when a requested page, space or comment does not exist. */
export class PageNotFoundError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'PAGE_NOT_FOUND');
    this.name = 'PageNotFoundError';
  }
}

/**
 * Raised when a page update loses an optimistic-locking race.
 *
 * Confluence rejects a write whose `version.number` is not exactly one above
 * the stored version. That means somebody else saved between our read and our
 * write, so retrying with the same body would silently discard their edit.
 */
export class VersionConflictError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'VERSION_CONFLICT');
    this.name = 'VersionConflictError';
  }
}

// ---------------------------------------------------------------------------
// Cache errors
// ---------------------------------------------------------------------------

/** Base class for cache-related errors. */
export class CacheError extends JiraMcpError {
  constructor(message: string, code = 'CACHE_ERROR') {
    super(message, code);
    this.name = 'CacheError';
  }
}

/**
 * Raised when the cache file does not exist.
 *
 * This typically means `sync_tasks` has never been run.
 */
export class CacheNotFoundError extends CacheError {
  constructor(message: string) {
    super(message, 'CACHE_NOT_FOUND');
    this.name = 'CacheNotFoundError';
  }
}

/**
 * Raised when the cache file exists but contains corrupt data.
 *
 * Examples:
 *  - Invalid JSON
 *  - Truncated file (interrupted write)
 */
export class CacheCorruptionError extends CacheError {
  constructor(message: string) {
    super(message, 'CACHE_CORRUPTION');
    this.name = 'CacheCorruptionError';
  }
}

/**
 * Raised when a requested task key is not present in the cache.
 */
export class TaskNotFoundError extends CacheError {
  constructor(message: string) {
    super(message, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Template errors
// ---------------------------------------------------------------------------

/** Base class for comment-template errors. */
export class TemplateError extends JiraMcpError {
  constructor(message: string, code = 'TEMPLATE_ERROR') {
    super(message, code);
    this.name = 'TemplateError';
  }
}

/**
 * Raised when a referenced template does not exist.
 */
export class TemplateNotFoundError extends TemplateError {
  constructor(message: string) {
    super(message, 'TEMPLATE_NOT_FOUND');
    this.name = 'TemplateNotFoundError';
  }
}

/**
 * Raised when a template references variables that were not supplied.
 */
export class TemplateMissingVariableError extends TemplateError {
  constructor(message: string) {
    super(message, 'TEMPLATE_MISSING_VAR');
    this.name = 'TemplateMissingVariableError';
  }
}

// ---------------------------------------------------------------------------
// Approval errors
// ---------------------------------------------------------------------------

/** Base class for approval / confirmation policy errors. */
export class ApprovalError extends JiraMcpError {
  constructor(message: string, code = 'APPROVAL_ERROR') {
    super(message, code);
    this.name = 'ApprovalError';
  }
}

/**
 * Raised when a comment-mutating tool is called without explicit user approval.
 */
export class CommentApprovalRequiredError extends ApprovalError {
  constructor(message: string) {
    super(message, 'COMMENT_APPROVAL_REQUIRED');
    this.name = 'CommentApprovalRequiredError';
  }
}

/**
 * Raised when a destructive delete tool is called without explicit approval.
 */
export class DeletionApprovalRequiredError extends ApprovalError {
  constructor(message: string) {
    super(message, 'DELETION_APPROVAL_REQUIRED');
    this.name = 'DeletionApprovalRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Ownership / authorization policy errors
// ---------------------------------------------------------------------------

/**
 * Raised when a delete action is attempted by someone other than the author.
 */
export class OwnershipError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'OWNERSHIP_REQUIRED');
    this.name = 'OwnershipError';
  }
}

/**
 * Raised when a requested comment cannot be found on the issue.
 */
export class CommentNotFoundError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'COMMENT_NOT_FOUND');
    this.name = 'CommentNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// ADF errors
// ---------------------------------------------------------------------------

/**
 * Raised when Atlassian Document Format conversion fails.
 *
 * Examples:
 *  - Unsupported ADF node type
 *  - Malformed ADF input
 */
export class AdfConversionError extends JiraMcpError {
  constructor(message: string) {
    super(message, 'ADF_CONVERSION');
    this.name = 'AdfConversionError';
  }
}
