/**
 * Tests for `jira-mcp config set-credentials` command handler.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleSetCredentials } from '../../../../src/cli/commands/config/set-credentials';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'jira-mcp-creds-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('handleSetCredentials', () => {
  it('writes credentials.json with Format B structure', async () => {
    const configDir = join(tempDir, 'jira-mcp');
    await mkdir(configDir, { recursive: true });

    await handleSetCredentials(configDir, 'user@example.com', 'secret-token-123');

    const raw = await readFile(join(configDir, 'credentials.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    expect(parsed).toEqual({
      default: {
        username: 'user@example.com',
        api_token: 'secret-token-123',
      },
    });
  });

  it('overwrites default credentials', async () => {
    const configDir = join(tempDir, 'jira-mcp');
    await mkdir(configDir, { recursive: true });

    await handleSetCredentials(configDir, 'old@example.com', 'old-token');
    await handleSetCredentials(configDir, 'new@example.com', 'new-token');

    const raw = await readFile(join(configDir, 'credentials.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { default: { username: string; api_token: string } };

    expect(parsed.default.username).toBe('new@example.com');
    expect(parsed.default.api_token).toBe('new-token');
  });

  it('produces valid JSON with proper formatting', async () => {
    const configDir = join(tempDir, 'jira-mcp');
    await mkdir(configDir, { recursive: true });

    await handleSetCredentials(configDir, 'test@test.com', 'tok');

    const raw = await readFile(join(configDir, 'credentials.json'), 'utf-8');

    // Verify it is pretty-printed (contains newlines + indentation)
    expect(raw).toContain('\n');
    expect(raw).toContain('  ');
  });
});
