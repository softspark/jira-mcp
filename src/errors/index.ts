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
 *   +-- CacheError
 *   |   +-- CacheNotFoundError
 *   |   +-- CacheCorruptionError
 *   |   +-- TaskNotFoundError
 *   +-- TemplateError
 *   |   +-- TemplateNotFoundError
 *   |   +-- TemplateMissingVariableError
 *   +-- ApprovalError
 *   |   +-- CommentApprovalRequiredError
 *   +-- AdfConversionError
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
