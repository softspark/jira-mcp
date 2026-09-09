// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tests for `template install-locale` and the shipped translations.
 *
 * The invariant that matters: a translation must keep the English `id` and the
 * English variable names of the template it replaces. Change either and the
 * override stops overriding, or every existing `add_templated_comment` call
 * breaks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  handleInstallLocale,
  listAvailableLocales,
  suffixTemplateId,
} from '../../../../src/cli/commands/template/index';
import {
  SYSTEM_COMMENT_TEMPLATES_DIR,
  systemLocaleCommentsDir,
} from '../../../../src/paths';

/** Parse a template file's JSON frontmatter. */
function meta(raw: string): Record<string, unknown> {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n/.exec(raw);
  return JSON.parse(m?.[1] ?? '{}') as Record<string, unknown>;
}

const ENGLISH = readdirSync(SYSTEM_COMMENT_TEMPLATES_DIR).filter((f) =>
  f.endsWith('.md'),
);

describe('shipped locales', () => {
  it('ships at least one language', () => {
    expect(listAvailableLocales().length).toBeGreaterThan(0);
  });

  it('ships Polish', () => {
    expect(listAvailableLocales()).toContain('pl');
  });

  it.each(listAvailableLocales())(
    '%s translates every shipped comment template',
    (lang) => {
      const translated = readdirSync(systemLocaleCommentsDir(lang)).filter((f) =>
        f.endsWith('.md'),
      );

      expect(translated.sort()).toEqual(ENGLISH.sort());
    },
  );

  it.each(listAvailableLocales())(
    '%s keeps the English id on every translation',
    (lang) => {
      for (const file of readdirSync(systemLocaleCommentsDir(lang))) {
        if (!file.endsWith('.md')) continue;
        const m = meta(readFileSync(join(systemLocaleCommentsDir(lang), file), 'utf-8'));
        // The id is what makes it an override. A translated id overrides nothing.
        expect(m['id']).toBe(file.replace(/\.md$/, ''));
      }
    },
  );

  it.each(listAvailableLocales())(
    '%s keeps the English variable names on every translation',
    (lang) => {
      for (const file of readdirSync(systemLocaleCommentsDir(lang))) {
        if (!file.endsWith('.md')) continue;
        const english = meta(
          readFileSync(join(SYSTEM_COMMENT_TEMPLATES_DIR, file), 'utf-8'),
        );
        const translated = meta(
          readFileSync(join(systemLocaleCommentsDir(lang), file), 'utf-8'),
        );

        const names = (vars: unknown): string[] =>
          ((vars ?? []) as { name: string }[]).map((v) => v.name).sort();

        // Callers pass these by name; translating them breaks every caller.
        expect(names(translated['variables'])).toEqual(
          names(english['variables']),
        );
      }
    },
  );

  it.each(listAvailableLocales())(
    '%s keeps the category, which is a fixed enum',
    (lang) => {
      for (const file of readdirSync(systemLocaleCommentsDir(lang))) {
        if (!file.endsWith('.md')) continue;
        const english = meta(
          readFileSync(join(SYSTEM_COMMENT_TEMPLATES_DIR, file), 'utf-8'),
        );
        const translated = meta(
          readFileSync(join(systemLocaleCommentsDir(lang), file), 'utf-8'),
        );

        expect(translated['category']).toBe(english['category']);
      }
    },
  );
});

describe('handleInstallLocale', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jira-mcp-locale-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function installed(): Promise<string[]> {
    return (await readdir(join(dir, 'templates', 'comments')))
      .filter((f) => f.endsWith('.md'))
      .sort();
  }

  it('installs every translated template as a user override', async () => {
    const result = await handleInstallLocale(dir, 'pl');

    expect(result.installed.length).toBe(ENGLISH.length);
    expect(await installed()).toEqual(ENGLISH.sort());
  });

  it('writes the translated body, not the English one', async () => {
    await handleInstallLocale(dir, 'pl');

    const raw = await readFile(
      join(dir, 'templates', 'comments', 'status-update.md'),
      'utf-8',
    );
    expect(raw).toContain('Aktualizacja statusu');
    expect(raw).not.toContain('## Status Update');
  });

  it('leaves the English wording unreachable by default', async () => {
    const result = await handleInstallLocale(dir, 'pl');

    expect(result.keptEnglish).toEqual([]);
    expect((await installed()).some((f) => f.endsWith('-en.md'))).toBe(false);
  });

  it('keeps the English originals under -en when asked', async () => {
    const result = await handleInstallLocale(dir, 'pl', { keepEnglish: true });

    expect(result.keptEnglish.length).toBe(ENGLISH.length);
    const raw = await readFile(
      join(dir, 'templates', 'comments', 'status-update-en.md'),
      'utf-8',
    );
    expect(meta(raw)['id']).toBe('status-update-en');
    expect(raw).toContain('## Status Update');
  });

  it('names the available languages when one is unknown', async () => {
    await expect(handleInstallLocale(dir, 'kl')).rejects.toThrow(/pl/);
  });

  it('is repeatable: a second install overwrites rather than duplicating', async () => {
    await handleInstallLocale(dir, 'pl');
    await handleInstallLocale(dir, 'pl');

    expect(await installed()).toEqual(ENGLISH.sort());
  });
});

describe('suffixTemplateId', () => {
  it('suffixes both the id and the display name', () => {
    const out = suffixTemplateId(
      '---\n{"id":"x","name":"X"}\n---\nbody\n',
      'en',
    );

    expect(meta(out ?? '')['id']).toBe('x-en');
    expect(meta(out ?? '')['name']).toBe('X (EN)');
  });

  it('keeps the body untouched', () => {
    const out = suffixTemplateId('---\n{"id":"x"}\n---\n## Heading\n', 'en');

    expect(out).toContain('## Heading');
  });

  it('returns undefined for unparseable frontmatter rather than throwing', () => {
    expect(suffixTemplateId('no frontmatter', 'en')).toBeUndefined();
    expect(suffixTemplateId('---\n{not json}\n---\nbody', 'en')).toBeUndefined();
    expect(suffixTemplateId('---\n{"name":"no id"}\n---\nbody', 'en')).toBeUndefined();
  });
});
