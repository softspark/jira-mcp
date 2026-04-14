/**
 * Tests for the custom error hierarchy.
 */

import { describe, it, expect } from 'vitest';

import {
  JiraMcpError,
  ConfigError,
  ConfigNotFoundError,
  ConfigValidationError,
  JiraConnectionError,
  JiraAuthenticationError,
  JiraPermissionError,
  CacheError,
  CacheNotFoundError,
  CacheCorruptionError,
  TaskNotFoundError,
  TemplateError,
  TemplateNotFoundError,
  TemplateMissingVariableError,
  AdfConversionError,
} from '../../src/errors/index';

describe('JiraMcpError', () => {
  it('extends Error', () => {
    const err = new JiraMcpError('test', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves message and code', () => {
    const err = new JiraMcpError('something failed', 'SOME_CODE');
    expect(err.message).toBe('something failed');
    expect(err.code).toBe('SOME_CODE');
  });

  it('has name set to JiraMcpError', () => {
    const err = new JiraMcpError('msg', 'CODE');
    expect(err.name).toBe('JiraMcpError');
  });
});

describe('ConfigError hierarchy', () => {
  it('ConfigError is instanceof JiraMcpError', () => {
    const err = new ConfigError('cfg error');
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('ConfigNotFoundError is instanceof ConfigError and JiraMcpError', () => {
    const err = new ConfigNotFoundError('not found');
    expect(err).toBeInstanceOf(ConfigError);
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('CONFIG_NOT_FOUND');
    expect(err.name).toBe('ConfigNotFoundError');
  });

  it('ConfigValidationError is instanceof ConfigError', () => {
    const err = new ConfigValidationError('invalid');
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.code).toBe('CONFIG_VALIDATION');
    expect(err.name).toBe('ConfigValidationError');
  });
});

describe('JiraConnectionError hierarchy', () => {
  it('JiraConnectionError is instanceof JiraMcpError', () => {
    const err = new JiraConnectionError('connection failed');
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('JIRA_CONNECTION');
  });

  it('JiraAuthenticationError is instanceof JiraConnectionError', () => {
    const err = new JiraAuthenticationError('bad token');
    expect(err).toBeInstanceOf(JiraConnectionError);
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('JIRA_AUTH');
    expect(err.name).toBe('JiraAuthenticationError');
  });

  it('JiraPermissionError is instanceof JiraConnectionError', () => {
    const err = new JiraPermissionError('no access');
    expect(err).toBeInstanceOf(JiraConnectionError);
    expect(err.code).toBe('JIRA_PERMISSION');
    expect(err.name).toBe('JiraPermissionError');
  });
});

describe('CacheError hierarchy', () => {
  it('CacheError is instanceof JiraMcpError', () => {
    const err = new CacheError('cache problem');
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('CACHE_ERROR');
  });

  it('CacheNotFoundError is instanceof CacheError', () => {
    const err = new CacheNotFoundError('missing');
    expect(err).toBeInstanceOf(CacheError);
    expect(err.code).toBe('CACHE_NOT_FOUND');
  });

  it('CacheCorruptionError is instanceof CacheError', () => {
    const err = new CacheCorruptionError('corrupted');
    expect(err).toBeInstanceOf(CacheError);
    expect(err.code).toBe('CACHE_CORRUPTION');
  });

  it('TaskNotFoundError is instanceof CacheError', () => {
    const err = new TaskNotFoundError('PROJ-999 not found');
    expect(err).toBeInstanceOf(CacheError);
    expect(err.code).toBe('TASK_NOT_FOUND');
    expect(err.name).toBe('TaskNotFoundError');
  });
});

describe('TemplateError hierarchy', () => {
  it('TemplateError is instanceof JiraMcpError', () => {
    const err = new TemplateError('template problem');
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('TEMPLATE_ERROR');
  });

  it('TemplateNotFoundError is instanceof TemplateError', () => {
    const err = new TemplateNotFoundError('missing template');
    expect(err).toBeInstanceOf(TemplateError);
    expect(err.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('TemplateMissingVariableError is instanceof TemplateError', () => {
    const err = new TemplateMissingVariableError('missing var');
    expect(err).toBeInstanceOf(TemplateError);
    expect(err.code).toBe('TEMPLATE_MISSING_VAR');
  });
});

describe('AdfConversionError', () => {
  it('is instanceof JiraMcpError', () => {
    const err = new AdfConversionError('conversion failed');
    expect(err).toBeInstanceOf(JiraMcpError);
    expect(err.code).toBe('ADF_CONVERSION');
    expect(err.name).toBe('AdfConversionError');
  });
});
