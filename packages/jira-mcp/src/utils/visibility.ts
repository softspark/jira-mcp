// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Zod schemas for the `visibility` and `internal` arguments of comment and
 * worklog tools.
 *
 * @module
 */

import { z } from 'zod';

import { parseToolArgs } from '@softspark/atlassian-mcp-core';

import type { JiraVisibility } from '../connector/types.js';

const NameSchema = z.string().trim().min(1, 'must not be empty');

/**
 * Restrict an item to a project role or a group, in Jira's own shape.
 *
 * A role is named by `value`. A group takes its name in `value` or its id in
 * `identifier`; the id survives a rename, the name does not.
 */
export const VisibilitySchema = z
  .object({
    type: z.enum(['group', 'role']),
    value: NameSchema.optional(),
    identifier: NameSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'role' && v.value === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'a role restriction needs value, the role name (e.g. "Administrators")',
      });
    }
    if (v.type === 'group' && v.value === undefined && v.identifier === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'a group restriction needs value (group name) or identifier (group id)',
      });
    }
  });

const VisibilityArgSchema = z.object({ visibility: VisibilitySchema.optional() });

/**
 * Validate a raw `visibility` argument. Absent or null means no restriction.
 *
 * @throws {InvalidInputError} When the value is not a valid restriction.
 */
export function parseVisibility(value: unknown): JiraVisibility | undefined {
  return parseToolArgs(VisibilityArgSchema, { visibility: value ?? undefined })
    .visibility;
}

const InternalArgSchema = z.object({ internal: z.boolean().optional() });

/**
 * Validate a raw `internal` flag. Strict on purpose: a lenient reader would
 * turn the string `"true"` into "not internal" and post the note to the
 * customer.
 *
 * @throws {InvalidInputError} When the value is not a boolean.
 */
export function parseInternal(value: unknown): boolean | undefined {
  return parseToolArgs(InternalArgSchema, { internal: value ?? undefined }).internal;
}
