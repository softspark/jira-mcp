// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Zod schema for a Jira issue key.
 *
 * @module
 */

import { z } from 'zod';

/**
 * Issue key such as `PROJ-123`: an upper-case project key, a dash, a number.
 *
 * Same shape the bulk task config and `config add-project` accept. The
 * project prefix is what routes a call to its Jira instance, so a key that
 * does not match cannot be routed at all.
 */
export const TaskKeySchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]*-\d+$/, 'expected a Jira issue key such as "PROJ-123"');
