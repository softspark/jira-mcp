/**
 * Tests for tool handler response helpers.
 */

import { describe, it, expect } from 'vitest';

import { success, failure, getOperations } from '../../src/tools/helpers';
import { JiraMcpError, ConfigValidationError } from '../../src/errors/index';
import {
  createMockInstancePool,
  createMockCacheManager,
  createMockConnector,
  asPool,
  asCacheManager,
} from '../fixtures/mocks';

// ---------------------------------------------------------------------------
// success()
// ---------------------------------------------------------------------------

describe('success', () => {
  it('wraps data with success: true in JSON text content', () => {
    const result = success({ count: 5, items: [] as unknown[] });

    expect(result.content).toHaveLength(1);
    const text = result.content[0];
    expect(text).toBeDefined();
    expect(text!.type).toBe('text');

    const parsed = JSON.parse((text as { text: string }).text) as Record<
      string,
      unknown
    >;
    expect(parsed['success']).toBe(true);
    expect(parsed['count']).toBe(5);
  });

  it('does not set isError', () => {
    const result = success({ ok: true });
    expect(result.isError).toBeUndefined();
  });

  it('preserves nested objects in JSON output', () => {
    const data = { nested: { a: 1 } };
    const result = success(data);
    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['nested']).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// failure()
// ---------------------------------------------------------------------------

describe('failure', () => {
  it('returns error message from Error instance', () => {
    const result = failure(new Error('something broke'));

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['success']).toBe(false);
    expect(parsed['error']).toBe('something broke');
    expect(parsed['code']).toBe('UNKNOWN_ERROR');
  });

  it('returns code from JiraMcpError', () => {
    const err = new JiraMcpError('bad config', 'CONFIG_ERROR');
    const result = failure(err);

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['code']).toBe('CONFIG_ERROR');
    expect(parsed['error']).toBe('bad config');
  });

  it('returns code from JiraMcpError subclass', () => {
    const err = new ConfigValidationError('missing field');
    const result = failure(err);

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['code']).toBe('CONFIG_VALIDATION');
  });

  it('converts non-Error values to string', () => {
    const result = failure('raw string error');

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['error']).toBe('raw string error');
    expect(parsed['code']).toBe('UNKNOWN_ERROR');
  });

  it('converts number to string', () => {
    const result = failure(42);

    const parsed = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(parsed['error']).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// getOperations()
// ---------------------------------------------------------------------------

describe('getOperations', () => {
  it('resolves connector from pool and returns TaskOperations', () => {
    const pool = createMockInstancePool();
    const cache = createMockCacheManager();
    const connector = createMockConnector();

    pool.getConnectorForTask.mockReturnValue(connector);

    const ops = getOperations(
      asPool(pool),
      asCacheManager(cache),
      'PROJ-123',
    );

    expect(pool.getConnectorForTask).toHaveBeenCalledWith('PROJ-123');
    expect(ops).toBeDefined();
  });
});
