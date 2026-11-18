// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Media type of an attachment, picked from its file extension.
 *
 * Jira stores the part's `Content-Type` as the attachment's `mimeType`, and
 * that decides whether the issue view previews the file (images, PDF) or only
 * offers a download. Sniffing the bytes would be more exact, but the short
 * list below covers what agents attach (screenshots, logs, exports) and an
 * unknown extension falls back to a plain download.
 *
 * @module
 */

/** Media type sent when the extension is not in {@link MEDIA_TYPES}. */
export const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

/** Lower-case extension (without the dot) to media type. */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
};

/**
 * Return the media type for a filename, case-insensitively.
 *
 * @example mediaTypeForFilename('Screen Shot.PNG') // 'image/png'
 * @example mediaTypeForFilename('notes')           // 'application/octet-stream'
 */
export function mediaTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    return DEFAULT_MEDIA_TYPE;
  }
  const extension = filename.slice(dot + 1).toLowerCase();
  return MEDIA_TYPES[extension] ?? DEFAULT_MEDIA_TYPE;
}
