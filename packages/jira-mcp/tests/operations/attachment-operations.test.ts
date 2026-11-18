// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for AttachmentOperations.
 *
 * Files are real, created under a fresh `os.tmpdir()` directory; the Jira
 * connector is a mock, so nothing leaves the process.
 */

import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidInputError } from '@softspark/atlassian-mcp-core';

import {
  AttachmentOperations,
  MAX_ATTACHMENT_BYTES,
} from '../../src/operations/attachment-operations';
import {
  asConnector,
  createAttachmentFixture,
  createMockConnector,
} from '../fixtures/mocks';

describe('AttachmentOperations', () => {
  let dir: string;
  let connector: ReturnType<typeof createMockConnector>;
  let ops: AttachmentOperations;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jira-mcp-attach-'));
    connector = createMockConnector();
    ops = new AttachmentOperations(asConnector(connector));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('addAttachmentFromFile', () => {
    it('uploads the bytes under the basename with the media type of the extension', async () => {
      const path = join(dir, 'Screen Shot.PNG');
      await writeFile(path, Buffer.from([1, 2, 3]));
      const created = createAttachmentFixture({ filename: 'Screen Shot.PNG' });
      connector.addAttachment.mockResolvedValue([created]);

      const result = await ops.addAttachmentFromFile('PROJ-1', path);

      expect(result).toEqual({ taskKey: 'PROJ-1', attachments: [created] });
      expect(connector.addAttachment).toHaveBeenCalledWith('PROJ-1', {
        filename: 'Screen Shot.PNG',
        content: Uint8Array.from([1, 2, 3]),
        mediaType: 'image/png',
      });
    });

    it('stores the file under an explicit filename and takes its extension for the type', async () => {
      const path = join(dir, 'report.bin');
      await writeFile(path, 'a,b\n1,2\n');
      connector.addAttachment.mockResolvedValue([createAttachmentFixture()]);

      await ops.addAttachmentFromFile('PROJ-1', path, 'export.csv');

      expect(connector.addAttachment).toHaveBeenCalledWith(
        'PROJ-1',
        expect.objectContaining({ filename: 'export.csv', mediaType: 'text/csv' }),
      );
    });

    it('accepts a file exactly at the size cap', async () => {
      const path = join(dir, 'edge.zip');
      await writeFile(path, '');
      await truncate(path, MAX_ATTACHMENT_BYTES);
      connector.addAttachment.mockResolvedValue([createAttachmentFixture()]);

      await ops.addAttachmentFromFile('PROJ-1', path);

      const [, upload] = connector.addAttachment.mock.calls[0] as [
        string,
        { content: Uint8Array },
      ];
      expect(upload.content.byteLength).toBe(MAX_ATTACHMENT_BYTES);
    });

    it('refuses a missing file with INVALID_INPUT', async () => {
      const path = join(dir, 'nope.png');

      await expect(ops.addAttachmentFromFile('PROJ-1', path)).rejects.toThrow(
        new InvalidInputError(`File not found: ${path}`),
      );
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('refuses a path under a regular file (ENOTDIR) as not found', async () => {
      const parent = join(dir, 'file.txt');
      await writeFile(parent, 'x');

      await expect(
        ops.addAttachmentFromFile('PROJ-1', join(parent, 'child.txt')),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it.skipIf(process.getuid?.() === 0)(
      'refuses an unreadable file with INVALID_INPUT',
      async () => {
        const path = join(dir, 'secret.txt');
        await writeFile(path, 'x');
        await chmod(path, 0o000);

        await expect(ops.addAttachmentFromFile('PROJ-1', path)).rejects.toThrow(
          new InvalidInputError(`Permission denied reading: ${path}`),
        );
        expect(connector.addAttachment).not.toHaveBeenCalled();
      },
    );

    it('rethrows a filesystem error that is not about the path as is', async () => {
      const loop = join(dir, 'loop');
      await symlink(loop, loop);

      const error = await ops
        .addAttachmentFromFile('PROJ-1', loop)
        .catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(InvalidInputError);
      expect((error as NodeJS.ErrnoException).code).toBe('ELOOP');
    });

    it('refuses a directory with INVALID_INPUT', async () => {
      const sub = join(dir, 'folder');
      await mkdir(sub);

      await expect(ops.addAttachmentFromFile('PROJ-1', sub)).rejects.toThrow(
        /Not a regular file/,
      );
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('refuses a file over the cap without uploading it', async () => {
      const path = join(dir, 'big.zip');
      await writeFile(path, '');
      await truncate(path, MAX_ATTACHMENT_BYTES + 1);

      const error = await ops
        .addAttachmentFromFile('PROJ-1', path)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidInputError);
      expect((error as InvalidInputError).code).toBe('INVALID_INPUT');
      expect((error as Error).message).toContain('10 MB');
      expect(connector.addAttachment).not.toHaveBeenCalled();
    });

    it('lets a connector error through unchanged', async () => {
      const path = join(dir, 'a.txt');
      await writeFile(path, 'x');
      const failure = new Error('boom');
      connector.addAttachment.mockRejectedValue(failure);

      await expect(ops.addAttachmentFromFile('PROJ-1', path)).rejects.toBe(failure);
    });
  });

  describe('listAttachments', () => {
    it('returns the connector list under the task key', async () => {
      const list = [
        createAttachmentFixture(),
        createAttachmentFixture({ id: '2', filename: 'b.pdf' }),
      ];
      connector.getAttachments.mockResolvedValue(list);

      await expect(ops.listAttachments('PROJ-1')).resolves.toEqual({
        taskKey: 'PROJ-1',
        attachments: list,
      });
      expect(connector.getAttachments).toHaveBeenCalledWith('PROJ-1');
    });
  });
});
