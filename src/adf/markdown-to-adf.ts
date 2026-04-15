/**
 * Markdown to ADF conversion -- zero-dependency implementation.
 *
 * Parses markdown line-by-line for block-level elements (headings, lists,
 * code blocks, blockquotes, horizontal rules) and inline elements within
 * text (bold, italic, strikethrough, inline code, links).
 *
 * Replaces the former `marklassian` dependency.
 */

import type { AdfDocument, AdfMark, AdfNode } from './types.js';

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a minimal ADF document that wraps raw text in a single paragraph.
 * Used as a safe fallback when the markdown parser fails.
 */
function buildPlainTextFallback(text: string): AdfDocument {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

/**
 * Convert a markdown string to an ADF document.
 *
 * On conversion failure the raw markdown is wrapped in a minimal
 * ADF paragraph so the caller always receives a valid document.
 */
export function markdownToAdf(markdown: string): AdfDocument {
  // Normalize literal \n (two-char sequence from MCP/JSON tool params) to real newlines
  const normalized = markdown.replace(/\\n/g, '\n');

  if (normalized.trim().length === 0) {
    return buildPlainTextFallback(normalized);
  }

  try {
    const content = parseBlocks(normalized);
    if (content.length === 0) {
      return buildPlainTextFallback(normalized);
    }
    return { version: 1, type: 'doc', content };
  } catch {
    return buildPlainTextFallback(normalized);
  }
}

/* ------------------------------------------------------------------ */
/*  Block-level parser                                                */
/* ------------------------------------------------------------------ */

/** Lines iterator that supports peeking and consuming. */
interface LineReader {
  readonly lines: readonly string[];
  pos: number;
}

function createReader(text: string): LineReader {
  return { lines: text.split('\n'), pos: 0 };
}

function peek(reader: LineReader): string | undefined {
  return reader.lines[reader.pos];
}

function consume(reader: LineReader): string {
  const line = reader.lines[reader.pos] ?? '';
  reader.pos++;
  return line;
}

function hasMore(reader: LineReader): boolean {
  return reader.pos < reader.lines.length;
}

/* Regex patterns for block-level elements */
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const UNORDERED_LIST_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_LIST_RE = /^(\s*)\d+\.\s+(.*)$/;
const CODE_FENCE_RE = /^```(\w*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const HORIZONTAL_RULE_RE = /^(?:---+|\*\*\*+|___+)\s*$/;
const TABLE_DELIMITER_CELL_RE = /^:?-{3,}:?$/;

function parseBlocks(markdown: string): readonly AdfNode[] {
  const reader = createReader(markdown);
  const nodes: AdfNode[] = [];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line === undefined) break;

    // Empty line -- skip
    if (line.trim() === '') {
      consume(reader);
      continue;
    }

    // Code fence
    const codeFenceMatch = CODE_FENCE_RE.exec(line);
    if (codeFenceMatch) {
      nodes.push(parseCodeBlock(reader, codeFenceMatch[1] ?? ''));
      continue;
    }

    // Horizontal rule (must be checked before unordered list for `---`)
    if (HORIZONTAL_RULE_RE.test(line)) {
      consume(reader);
      nodes.push({ type: 'rule' });
      continue;
    }

    // Heading
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      consume(reader);
      const level = (headingMatch[1] ?? '#').length;
      const text = headingMatch[2] ?? '';
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: parseInline(text),
      });
      continue;
    }

    // Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      nodes.push(parseBlockquote(reader));
      continue;
    }

    // Unordered list
    if (UNORDERED_LIST_RE.test(line)) {
      nodes.push(parseUnorderedList(reader));
      continue;
    }

    // Ordered list
    if (ORDERED_LIST_RE.test(line)) {
      nodes.push(parseOrderedList(reader));
      continue;
    }

    // Markdown table
    if (isTableStart(reader)) {
      nodes.push(parseTable(reader));
      continue;
    }

    // Default: paragraph (collect contiguous non-empty, non-block lines)
    nodes.push(parseParagraph(reader));
  }

  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Block element parsers                                             */
/* ------------------------------------------------------------------ */

function parseCodeBlock(reader: LineReader, language: string): AdfNode {
  consume(reader); // opening fence
  const codeLines: string[] = [];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line !== undefined && /^```\s*$/.test(line)) {
      consume(reader); // closing fence
      break;
    }
    codeLines.push(consume(reader));
  }

  const codeText = codeLines.join('\n');

  return {
    type: 'codeBlock',
    attrs: { language: language || 'text' },
    content: codeText.length > 0 ? [{ type: 'text', text: codeText }] : [],
  };
}

function parseBlockquote(reader: LineReader): AdfNode {
  const quotedLines: string[] = [];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line === undefined) break;
    const bqMatch = BLOCKQUOTE_RE.exec(line);
    if (!bqMatch) break;
    consume(reader);
    quotedLines.push(bqMatch[1] ?? '');
  }

  const innerMarkdown = quotedLines.join('\n');
  const innerContent = parseBlocks(innerMarkdown);

  return {
    type: 'blockquote',
    content: innerContent.length > 0 ? innerContent as AdfNode[] : [buildParagraph([])],
  };
}

function parseUnorderedList(reader: LineReader): AdfNode {
  const items = parseListItems(reader, UNORDERED_LIST_RE);
  return {
    type: 'bulletList',
    content: items,
  };
}

function parseOrderedList(reader: LineReader): AdfNode {
  const items = parseListItems(reader, ORDERED_LIST_RE);
  return {
    type: 'orderedList',
    attrs: { order: 1 },
    content: items,
  };
}

function parseListItems(
  reader: LineReader,
  pattern: RegExp,
): readonly AdfNode[] {
  const items: AdfNode[] = [];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line === undefined) break;
    const match = pattern.exec(line);
    if (!match) break;
    consume(reader);
    const text = match[2] ?? '';
    items.push({
      type: 'listItem',
      content: [buildParagraph(parseInline(text))],
    });
  }

  return items;
}

function parseParagraph(reader: LineReader): AdfNode {
  const textParts: string[] = [];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line === undefined) break;

    // Stop at blank line or start of a new block element
    if (line.trim() === '') break;
    if (HEADING_RE.test(line)) break;
    if (CODE_FENCE_RE.test(line)) break;
    if (HORIZONTAL_RULE_RE.test(line)) break;
    if (BLOCKQUOTE_RE.test(line)) break;
    if (UNORDERED_LIST_RE.test(line)) break;
    if (ORDERED_LIST_RE.test(line)) break;
    if (isTableStart(reader)) break;

    const consumed = consume(reader);

    // Handle hard line break (trailing two spaces or backslash)
    if (consumed.endsWith('  ') || consumed.endsWith('\\')) {
      const trimmed = consumed.endsWith('\\')
        ? consumed.slice(0, -1)
        : consumed.trimEnd();
      textParts.push(trimmed);
      textParts.push('\n'); // sentinel for hardBreak
    } else {
      textParts.push(consumed);
    }
  }

  const combinedText = textParts.join(' ').replace(/ \n /g, '\n');
  return buildParagraph(parseInlineWithBreaks(combinedText));
}

function buildParagraph(content: readonly AdfNode[]): AdfNode {
  return {
    type: 'paragraph',
    content: content.length > 0 ? content : [{ type: 'text', text: ' ' }],
  };
}

function isTableStart(reader: LineReader): boolean {
  const headerLine = reader.lines[reader.pos];
  const delimiterLine = reader.lines[reader.pos + 1];

  if (headerLine === undefined || delimiterLine === undefined) {
    return false;
  }

  const headerCells = splitTableRow(headerLine);
  if (headerCells.length === 0) {
    return false;
  }

  const delimiterCells = splitTableDelimiter(delimiterLine);
  return delimiterCells.length === headerCells.length;
}

function parseTable(reader: LineReader): AdfNode {
  const headerLine = consume(reader);
  consume(reader); // delimiter row

  const headerCells = splitTableRow(headerLine);
  const width = headerCells.length;
  const rows: AdfNode[] = [buildTableRow(headerCells, 'tableHeader', width)];

  while (hasMore(reader)) {
    const line = peek(reader);
    if (line === undefined || line.trim() === '') {
      break;
    }

    const rowCells = splitTableRow(line);
    if (rowCells.length === 0) {
      break;
    }

    consume(reader);
    rows.push(buildTableRow(rowCells, 'tableCell', width));
  }

  return {
    type: 'table',
    attrs: {
      isNumberColumnEnabled: false,
      layout: 'default',
    },
    content: rows,
  };
}

function buildTableRow(
  cells: readonly string[],
  cellType: 'tableHeader' | 'tableCell',
  width: number,
): AdfNode {
  const normalizedCells = normalizeTableCells(cells, width);

  return {
    type: 'tableRow',
    content: normalizedCells.map((cell) => ({
      type: cellType,
      content: [buildParagraph(parseInlineWithBreaks(cell))],
    })),
  };
}

function normalizeTableCells(
  cells: readonly string[],
  width: number,
): readonly string[] {
  if (cells.length === width) {
    return cells;
  }

  if (cells.length > width) {
    return cells.slice(0, width);
  }

  return [...cells, ...Array.from({ length: width - cells.length }, () => '')];
}

function splitTableDelimiter(line: string): readonly string[] {
  const cells = splitTableRow(line);
  if (cells.length === 0) {
    return [];
  }

  return cells.every((cell) => TABLE_DELIMITER_CELL_RE.test(cell)) ? cells : [];
}

function splitTableRow(line: string): readonly string[] {
  if (!line.includes('|')) {
    return [];
  }

  let normalized = line.trim();
  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized.trim().length === 0) {
    return [];
  }

  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (ch === '\\' && next === '|') {
      current += '|';
      i++;
      continue;
    }

    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      continue;
    }

    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells.some((cell) => cell.length > 0) ? cells : [];
}

/* ------------------------------------------------------------------ */
/*  Inline parser                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse inline markdown and produce ADF inline nodes.
 *
 * Handles: bold, italic, strikethrough, inline code, links.
 * Returns an array of AdfNode (type "text" with optional marks, or "hardBreak").
 */
function parseInline(text: string): readonly AdfNode[] {
  if (text.length === 0) return [];
  return tokenizeInline(text);
}

/** Parse inline content, also splitting on hard break sentinels (\n). */
function parseInlineWithBreaks(text: string): readonly AdfNode[] {
  if (text.length === 0) return [];

  const segments = text.split('\n');
  const nodes: AdfNode[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment !== undefined && segment.length > 0) {
      nodes.push(...tokenizeInline(segment));
    }
    if (i < segments.length - 1) {
      nodes.push({ type: 'hardBreak' });
    }
  }

  return nodes;
}

/**
 * Tokenize inline markdown into ADF text nodes with marks.
 *
 * Uses a single-pass character scanner that identifies:
 * - `**` / `__`  -> strong
 * - `*` / `_`    -> em
 * - `~~`         -> strike
 * - `` ` ``      -> code
 * - `[text](url)` -> link
 */
function tokenizeInline(text: string): readonly AdfNode[] {
  const nodes: AdfNode[] = [];
  let pos = 0;
  let buffer = '';

  function flushBuffer(): void {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', text: buffer });
      buffer = '';
    }
  }

  while (pos < text.length) {
    const ch = text[pos];
    const next = text[pos + 1];

    // Escaped character
    if (ch === '\\' && pos + 1 < text.length) {
      buffer += text[pos + 1] ?? '';
      pos += 2;
      continue;
    }

    // Inline code: `...`
    if (ch === '`') {
      const endIdx = text.indexOf('`', pos + 1);
      if (endIdx !== -1) {
        flushBuffer();
        const codeText = text.slice(pos + 1, endIdx);
        nodes.push(makeTextNode(codeText, [{ type: 'code' }]));
        pos = endIdx + 1;
        continue;
      }
    }

    // Bold: ** or __
    if ((ch === '*' && next === '*') || (ch === '_' && next === '_')) {
      const delimiter = text.slice(pos, pos + 2);
      const endIdx = text.indexOf(delimiter, pos + 2);
      if (endIdx !== -1) {
        flushBuffer();
        const innerText = text.slice(pos + 2, endIdx);
        const innerNodes = tokenizeInline(innerText);
        for (const node of innerNodes) {
          nodes.push(addMark(node, { type: 'strong' }));
        }
        pos = endIdx + 2;
        continue;
      }
    }

    // Strikethrough: ~~
    if (ch === '~' && next === '~') {
      const endIdx = text.indexOf('~~', pos + 2);
      if (endIdx !== -1) {
        flushBuffer();
        const innerText = text.slice(pos + 2, endIdx);
        const innerNodes = tokenizeInline(innerText);
        for (const node of innerNodes) {
          nodes.push(addMark(node, { type: 'strike' }));
        }
        pos = endIdx + 2;
        continue;
      }
    }

    // Italic: * or _ (single, not doubled)
    if ((ch === '*' || ch === '_') && next !== ch) {
      const endIdx = findClosingDelimiter(text, ch, pos + 1);
      if (endIdx !== -1) {
        flushBuffer();
        const innerText = text.slice(pos + 1, endIdx);
        const innerNodes = tokenizeInline(innerText);
        for (const node of innerNodes) {
          nodes.push(addMark(node, { type: 'em' }));
        }
        pos = endIdx + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (ch === '[') {
      const linkResult = tryParseLink(text, pos);
      if (linkResult) {
        flushBuffer();
        nodes.push(
          makeTextNode(linkResult.text, [
            { type: 'link', attrs: { href: linkResult.href } },
          ]),
        );
        pos = linkResult.endPos;
        continue;
      }
    }

    buffer += ch;
    pos++;
  }

  flushBuffer();
  return nodes;
}

/** Find a closing single-char delimiter, skipping escaped chars. */
function findClosingDelimiter(
  text: string,
  delimiter: string,
  startPos: number,
): number {
  let i = startPos;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === delimiter) {
      // For `*` delimiter, make sure we don't match `**`
      if (text[i + 1] === delimiter) {
        i += 2;
        continue;
      }
      return i;
    }
    i++;
  }
  return -1;
}

/** Try parsing a markdown link `[text](url)` starting at `[`. */
function tryParseLink(
  text: string,
  pos: number,
): { readonly text: string; readonly href: string; readonly endPos: number } | undefined {
  if (text[pos] !== '[') return undefined;

  const closeBracket = text.indexOf(']', pos + 1);
  if (closeBracket === -1) return undefined;
  if (text[closeBracket + 1] !== '(') return undefined;

  const closeParen = text.indexOf(')', closeBracket + 2);
  if (closeParen === -1) return undefined;

  return {
    text: text.slice(pos + 1, closeBracket),
    href: text.slice(closeBracket + 2, closeParen),
    endPos: closeParen + 1,
  };
}

/* ------------------------------------------------------------------ */
/*  ADF node helpers                                                  */
/* ------------------------------------------------------------------ */

function makeTextNode(
  text: string,
  marks: readonly AdfMark[],
): AdfNode {
  if (marks.length === 0) {
    return { type: 'text', text };
  }
  return { type: 'text', text, marks };
}

/** Clone a node, adding an extra mark. Recurses into nested marks. */
function addMark(node: AdfNode, mark: AdfMark): AdfNode {
  if (node.type !== 'text') return node;

  const existingMarks: readonly AdfMark[] = node.marks ?? [];
  return {
    type: 'text',
    text: node.text ?? '',
    marks: [...existingMarks, mark],
  };
}
