/**
 * File-backed template loading and validation helpers.
 *
 * Template files are markdown documents with a JSON metadata block:
 *
 * ---
 * { "kind": "comment", "id": "status-update", ... }
 * ---
 * Markdown body...
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { CommentTemplate, TemplateSource, TemplateVariable } from './types.js';
import { TEMPLATE_CATEGORIES } from './types.js';
import type { TaskTemplate } from './task-types.js';
import { pathExists } from '../utils/fs.js';
import { TemplateError } from '../errors/index.js';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

const TemplateVariableFileSchema = z.object({
  name: z.string().regex(/^\w+$/, 'Variable name must be alphanumeric/underscore'),
  description: z.string().default(''),
  required: z.boolean().default(false),
  default: z.string().optional(),
  example: z.string().optional(),
});

const CommentTemplateFileSchema = z.object({
  kind: z.literal('comment'),
  id: z.string().regex(ID_PATTERN, 'Template id must be a URL-safe slug'),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum([
    TEMPLATE_CATEGORIES.WORKFLOW,
    TEMPLATE_CATEGORIES.COMMUNICATION,
    TEMPLATE_CATEGORIES.REPORTING,
    TEMPLATE_CATEGORIES.DEVELOPMENT,
  ]),
  variables: z.array(TemplateVariableFileSchema).default([]),
});

const TaskTemplateFileSchema = z.object({
  kind: z.literal('task'),
  id: z.string().regex(ID_PATTERN, 'Template id must be a URL-safe slug'),
  name: z.string().min(1),
  description: z.string().min(1),
  summary: z.string().min(1),
  issue_type: z.string().optional(),
  priority: z.string().optional(),
  labels: z.array(z.string()).optional(),
  epic_key: z.string().optional(),
  variables: z.array(TemplateVariableFileSchema).default([]),
});

interface ParsedMarkdownTemplate {
  readonly metadata: unknown;
  readonly body: string;
}

function mapVariables(
  variables: readonly z.infer<typeof TemplateVariableFileSchema>[],
): readonly TemplateVariable[] {
  return variables.map((variable) => ({
    name: variable.name,
    description: variable.description,
    required: variable.required,
    defaultValue: variable.default,
    example: variable.example,
  }));
}

function parseMarkdownTemplateFile(
  raw: string,
  filePath: string,
): ParsedMarkdownTemplate {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    throw new TemplateError(
      `Template file "${filePath}" must start with a JSON metadata block delimited by ---`,
    );
  }

  const [, rawMetadata, body = ''] = match;
  if (rawMetadata === undefined) {
    throw new TemplateError(`Template file "${filePath}" is missing metadata.`);
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(rawMetadata);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TemplateError(
      `Template file "${filePath}" contains invalid JSON metadata: ${message}`,
    );
  }

  return { metadata, body: body.trim() };
}

function listMarkdownFilesSync(directoryPath: string): readonly string[] {
  if (!readdirSync || !directoryPath) {
    return [];
  }

  try {
    return readdirSync(directoryPath)
      .filter((entry) => entry.endsWith('.md'))
      .sort()
      .map((entry) => join(directoryPath, entry));
  } catch {
    return [];
  }
}

export function loadCommentTemplatesFromDirectorySync(
  directoryPath: string,
  source: TemplateSource,
): readonly CommentTemplate[] {
  const results: CommentTemplate[] = [];

  for (const filePath of listMarkdownFilesSync(directoryPath)) {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseMarkdownTemplateFile(raw, filePath);
    const metadata = CommentTemplateFileSchema.parse(parsed.metadata);

    results.push({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      variables: mapVariables(metadata.variables),
      body: parsed.body,
      source,
      filePath,
    });
  }

  return results;
}

export function loadTaskTemplatesFromDirectorySync(
  directoryPath: string,
  source: TemplateSource,
): readonly TaskTemplate[] {
  const results: TaskTemplate[] = [];

  for (const filePath of listMarkdownFilesSync(directoryPath)) {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseMarkdownTemplateFile(raw, filePath);
    const metadata = TaskTemplateFileSchema.parse(parsed.metadata);

    results.push({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      summary: metadata.summary,
      issueType: metadata.issue_type,
      priority: metadata.priority,
      labels: metadata.labels,
      epicKey: metadata.epic_key,
      variables: mapVariables(metadata.variables),
      body: parsed.body,
      source,
      filePath,
    });
  }

  return results;
}

export async function validateTemplateFile(
  filePath: string,
  expectedKind: 'comment' | 'task',
): Promise<CommentTemplate | TaskTemplate> {
  if (!(await pathExists(filePath))) {
    throw new TemplateError(`Template file not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const parsed = parseMarkdownTemplateFile(raw, filePath);

  if (expectedKind === 'comment') {
    const metadata = CommentTemplateFileSchema.parse(parsed.metadata);
    return {
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      variables: mapVariables(metadata.variables),
      body: parsed.body,
      source: 'user',
      filePath,
    };
  }

  const metadata = TaskTemplateFileSchema.parse(parsed.metadata);
  return {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    summary: metadata.summary,
    issueType: metadata.issue_type,
    priority: metadata.priority,
    labels: metadata.labels,
    epicKey: metadata.epic_key,
    variables: mapVariables(metadata.variables),
    body: parsed.body,
    source: 'user',
    filePath,
  };
}
