// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * ADF to Markdown converter.
 *
 * Lightweight, zero-dependency implementation that handles the ADF node
 * types returned by Jira REST API v3. Replaces the `adf-to-md` package
 * which pulled in eslint and 300+ transitive dependencies.
 */

import type { AdfDocument, AdfNode } from './types.js';

const NO_CONTENT_PLACEHOLDER = '(No content)';

/**
 * Convert an ADF document to readable markdown.
 *
 * - `null` / `undefined` input returns a placeholder string.
 * - On conversion failure the raw ADF JSON is returned.
 */
export function adfToMarkdown(adf: AdfDocument | null | undefined): string {
  if (adf == null) {
    return NO_CONTENT_PLACEHOLDER;
  }

  try {
    const result = convertNodes(adf.content ?? []).trim();
    return result.length > 0 ? result : NO_CONTENT_PLACEHOLDER;
  } catch {
    return `[ADF conversion failed]\n\n${JSON.stringify(adf, null, 2)}`;
  }
}

function convertNodes(nodes: readonly AdfNode[]): string {
  return nodes.map(convertNode).join('');
}

function convertNode(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks ?? []);

    case 'paragraph':
      return convertNodes(node.content ?? []) + '\n\n';

    case 'heading': {
      const level = (node.attrs?.['level'] as number) ?? 1;
      const prefix = '#'.repeat(Math.min(level, 6));
      return `${prefix} ${convertNodes(node.content ?? []).trim()}\n\n`;
    }

    case 'bulletList':
      return convertList(node.content ?? [], '-', 0) + '\n';

    case 'orderedList':
      return convertList(node.content ?? [], '1.', 0) + '\n';

    case 'taskList':
      return convertTaskList(node.content ?? [], 0) + '\n';

    case 'listItem':
      return convertNodes(node.content ?? []);

    case 'codeBlock': {
      const lang = (node.attrs?.['language'] as string) ?? '';
      const code = convertNodes(node.content ?? []).trim();
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case 'blockquote':
      return convertNodes(node.content ?? [])
        .trim()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n') + '\n\n';

    case 'rule':
      return '---\n\n';

    case 'hardBreak':
      return '\n';

    case 'mention': {
      const text = node.attrs?.['text'] as string | undefined;
      return text ?? '@unknown';
    }

    case 'emoji': {
      const shortName = node.attrs?.['shortName'] as string | undefined;
      return shortName ?? '';
    }

    case 'inlineCard': {
      const url = node.attrs?.['url'] as string | undefined;
      return url ? `[${url}](${url})` : '';
    }

    case 'panel': {
      const panelType = (node.attrs?.['panelType'] as string) ?? 'info';
      const inner = convertNodes(node.content ?? []).trim();
      return `> **${panelType.toUpperCase()}:** ${inner}\n\n`;
    }

    case 'table':
      return convertTable(node.content ?? []) + '\n';

    case 'tableRow':
    case 'tableHeader':
    case 'tableCell':
      return convertNodes(node.content ?? []);

    case 'mediaSingle':
    case 'media':
      return '[media]\n\n';

    case 'status': {
      const text = node.attrs?.['text'] as string | undefined;
      return text ? `[${text}]` : '';
    }

    case 'date': {
      const timestamp = Number(node.attrs?.['timestamp']);
      if (!Number.isFinite(timestamp)) return '';
      return new Date(timestamp).toISOString().slice(0, 10);
    }

    default:
      if (node.content) {
        return convertNodes(node.content);
      }
      return node.text ?? '';
  }
}

function applyMarks(text: string, marks: NonNullable<AdfNode['marks']>): string {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'strong':
        result = `**${result}**`;
        break;
      case 'em':
        result = `*${result}*`;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'link': {
        const href = mark.attrs?.['href'] as string | undefined;
        if (href) {
          result = `[${result}](${href})`;
        }
        break;
      }
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      default:
        break;
    }
  }
  return result;
}

/**
 * Render list items at the given nesting depth.
 *
 * Inline children (paragraphs) form the item line; nested lists render
 * on the following lines indented by two spaces per level.
 */
function convertList(
  items: readonly AdfNode[],
  prefix: string,
  depth: number,
): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const item of items) {
    const inlineParts: string[] = [];
    const nestedParts: string[] = [];

    for (const child of item.content ?? []) {
      if (child.type === 'bulletList') {
        nestedParts.push(convertList(child.content ?? [], '-', depth + 1));
      } else if (child.type === 'orderedList') {
        nestedParts.push(convertList(child.content ?? [], '1.', depth + 1));
      } else if (child.type === 'taskList') {
        nestedParts.push(convertTaskList(child.content ?? [], depth + 1));
      } else {
        inlineParts.push(convertNode(child).trim());
      }
    }

    lines.push(`${indent}${prefix} ${inlineParts.filter(Boolean).join(' ')}`);
    lines.push(...nestedParts.filter(Boolean));
  }

  return lines.join('\n');
}

/** Render an ADF task list as markdown checkboxes (`- [ ]` / `- [x]`). */
function convertTaskList(items: readonly AdfNode[], depth: number): string {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const item of items) {
    if (item.type === 'taskList') {
      lines.push(convertTaskList(item.content ?? [], depth + 1));
      continue;
    }
    const checkbox = item.attrs?.['state'] === 'DONE' ? 'x' : ' ';
    const text = convertNodes(item.content ?? []).trim();
    lines.push(`${indent}- [${checkbox}] ${text}`);
  }

  return lines.join('\n');
}

function convertTable(rows: readonly AdfNode[]): string {
  if (rows.length === 0) return '';

  const tableRows: string[][] = [];

  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      cells.push(convertNodes(cell.content ?? []).trim());
    }
    tableRows.push(cells);
  }

  if (tableRows.length === 0) return '';

  const lines: string[] = [];
  const firstRow = tableRows[0] ?? [];
  lines.push('| ' + firstRow.join(' | ') + ' |');
  lines.push('| ' + firstRow.map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < tableRows.length; i++) {
    const row = tableRows[i] ?? [];
    lines.push('| ' + row.join(' | ') + ' |');
  }

  return lines.join('\n') + '\n';
}
