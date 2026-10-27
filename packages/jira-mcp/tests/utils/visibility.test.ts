// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for the visibility argument parser shared by comment and worklog tools.
 */

import { describe, it, expect } from 'vitest';

import { InvalidInputError } from '@softspark/atlassian-mcp-core';

import { parseInternal, parseVisibility } from '../../src/utils/visibility';

describe('parseInternal', () => {
  it('passes booleans through and treats absent or null as unset', () => {
    expect(parseInternal(true)).toBe(true);
    expect(parseInternal(false)).toBe(false);
    expect(parseInternal(undefined)).toBeUndefined();
    expect(parseInternal(null)).toBeUndefined();
  });

  it('rejects anything that is not a boolean', () => {
    for (const bad of ['true', 1, {}]) {
      expect(() => parseInternal(bad)).toThrow(InvalidInputError);
    }
  });
});

describe('parseVisibility', () => {
  it('returns undefined when absent or null', () => {
    expect(parseVisibility(undefined)).toBeUndefined();
    expect(parseVisibility(null)).toBeUndefined();
  });

  it('accepts a role by name', () => {
    expect(parseVisibility({ type: 'role', value: 'Administrators' })).toEqual({
      type: 'role',
      value: 'Administrators',
    });
  });

  it('accepts a group by name or by id', () => {
    expect(parseVisibility({ type: 'group', value: 'jira-developers' })).toEqual({
      type: 'group',
      value: 'jira-developers',
    });
    expect(parseVisibility({ type: 'group', identifier: 'group-id-1' })).toEqual({
      type: 'group',
      identifier: 'group-id-1',
    });
  });

  it('trims names', () => {
    expect(parseVisibility({ type: 'role', value: '  Developers ' })).toEqual({
      type: 'role',
      value: 'Developers',
    });
  });

  it('rejects a role without a name', () => {
    expect(() => parseVisibility({ type: 'role', identifier: 'x' })).toThrow(
      /visibility\.value: a role restriction needs value/,
    );
  });

  it('rejects a group with neither name nor id', () => {
    expect(() => parseVisibility({ type: 'group' })).toThrow(
      /a group restriction needs value \(group name\) or identifier \(group id\)/,
    );
  });

  it('rejects an empty name', () => {
    expect(() => parseVisibility({ type: 'group', value: '   ' })).toThrow(
      /visibility\.value: must not be empty/,
    );
  });

  it('rejects an unknown type, unknown keys and non-objects as INVALID_INPUT', () => {
    for (const bad of [{ type: 'user', value: 'x' }, { type: 'role', value: 'x', extra: 1 }, 'role']) {
      expect(() => parseVisibility(bad)).toThrow(InvalidInputError);
    }
  });
});
