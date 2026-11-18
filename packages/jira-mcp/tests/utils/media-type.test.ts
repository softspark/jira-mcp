// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for attachment media type detection.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEDIA_TYPE,
  mediaTypeForFilename,
} from '../../src/utils/media-type';

describe('mediaTypeForFilename', () => {
  it.each([
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
    ['a.pdf', 'application/pdf'],
    ['a.txt', 'text/plain'],
    ['a.csv', 'text/csv'],
    ['a.json', 'application/json'],
    ['a.zip', 'application/zip'],
  ])('maps %s to %s', (filename, expected) => {
    expect(mediaTypeForFilename(filename)).toBe(expected);
  });

  it('ignores the case of the extension', () => {
    expect(mediaTypeForFilename('Screen Shot.PNG')).toBe('image/png');
  });

  it('uses only the last extension', () => {
    expect(mediaTypeForFilename('logs.tar.gz')).toBe(DEFAULT_MEDIA_TYPE);
    expect(mediaTypeForFilename('data.backup.json')).toBe('application/json');
  });

  it.each(['README', '.png', 'trailing.', 'a.exe'])(
    'falls back to application/octet-stream for %s',
    (filename) => {
      expect(mediaTypeForFilename(filename)).toBe('application/octet-stream');
    },
  );
});
