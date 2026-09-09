// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/confluence-mcp

/**
 * Tests for page templates: the shipped set, the registry, and the rules that
 * keep a template from being used in a space it cannot work in.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PageTemplateRegistry,
  parsePageTemplate,
} from '../../src/templates/registry';
import { SYSTEM_PAGE_TEMPLATES_DIR } from '../../src/paths';

const SHIPPED = PageTemplateRegistry.load(SYSTEM_PAGE_TEMPLATES_DIR, '/nonexistent');

describe('shipped page templates', () => {
  it('loads the templates that ship with the package', () => {
    // Guards the loader itself: an empty registry would make the assertions
    // below pass vacuously.
    expect(SHIPPED.listTemplates().length).toBeGreaterThanOrEqual(3);
  });

  it('gives every template an id, a title pattern and a body', () => {
    for (const t of SHIPPED.listTemplates()) {
      expect(t.id).not.toBe('');
      expect(t.title).not.toBe('');
      expect(t.body.length).toBeGreaterThan(0);
    }
  });

  it('declares every variable a template body actually uses', () => {
    for (const t of SHIPPED.listTemplates()) {
      const used = new Set(
        [...`${t.title}\n${t.body}`.matchAll(/\{\{#?\/?(\w+)\}\}/g)].map(
          (m) => m[1] as string,
        ),
      );
      const declared = new Set(t.variables.map((v) => v.name));
      const undeclared = [...used].filter((n) => !declared.has(n));
      expect({ template: t.id, undeclared }).toEqual({
        template: t.id,
        undeclared: [],
      });
    }
  });

  it('renders every template from its declared examples and defaults', () => {
    for (const t of SHIPPED.listTemplates()) {
      const vars = Object.fromEntries(
        t.variables.map((v) => [v.name, v.example ?? v.defaultValue ?? 'x']),
      );

      const rendered = SHIPPED.render(t.id, vars);

      expect(rendered.title).not.toContain('{{');
      expect(rendered.body).not.toContain('{{');
      expect(rendered.format).toBe(t.format);
    }
  });

  it('writes storage templates as XHTML and markdown templates as markdown', () => {
    for (const t of SHIPPED.listTemplates('storage')) {
      expect(t.body).toMatch(/<(ac:|h2|p)/);
    }
    for (const t of SHIPPED.listTemplates('markdown')) {
      expect(t.body).not.toContain('<ac:');
    }
  });

  it('ships at least one template per format', () => {
    expect(SHIPPED.listTemplates('markdown').length).toBeGreaterThan(0);
    expect(SHIPPED.listTemplates('storage').length).toBeGreaterThan(0);
  });
});

describe('PageTemplateRegistry', () => {
  it('reports the available ids when one is not found', () => {
    expect(() => SHIPPED.getTemplate('nope')).toThrow(/runbook/);
  });

  it('refuses to render without a required variable, naming it', () => {
    expect(() => SHIPPED.render('runbook', {})).toThrow(/system/);
  });

  it('falls back to a declared default', () => {
    const rendered = SHIPPED.render('runbook', {
      system: 'GitLab',
      procedure: 'token renewal',
      when: 'quarterly',
      steps: '1. do it',
      verification: 'it works',
    });

    // prerequisites defaults to "None."
    expect(rendered.body).toContain('None.');
  });

  it('drops a conditional block whose variable is absent', () => {
    const rendered = SHIPPED.render('runbook', {
      system: 'GitLab',
      procedure: 'x',
      when: 'y',
      steps: 'z',
      verification: 'w',
    });

    expect(rendered.body).not.toContain('Rollback');
  });

  it('keeps a conditional block whose variable is supplied', () => {
    const rendered = SHIPPED.render('runbook', {
      system: 'GitLab',
      procedure: 'x',
      when: 'y',
      steps: 'z',
      verification: 'w',
      rollback: 'restore the old token',
    });

    expect(rendered.body).toContain('Rollback');
    expect(rendered.body).toContain('restore the old token');
  });

  it('renders variables into the title as well as the body', () => {
    const rendered = SHIPPED.render('runbook', {
      system: 'GitLab',
      procedure: 'token renewal',
      when: 'y',
      steps: 'z',
      verification: 'w',
    });

    expect(rendered.title).toBe('GitLab runbook: token renewal');
  });

  it('carries the template labels through', () => {
    expect(
      SHIPPED.render('incident-review', {
        title: 'Traefik 502s',
        date: '2026-09-09',
        impact: 'x',
        timeline: 'y',
        root_cause: 'z',
        actions: 'w',
      }).labels,
    ).toContain('incident');
  });
});

describe('user templates', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'confluence-page-templates-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('overrides a shipped template of the same id', async () => {
    await writeFile(
      join(dir, 'runbook.md'),
      '---\n{"id":"runbook","title":"Mine","variables":[]}\n---\nlocal body\n',
      'utf-8',
    );

    const registry = PageTemplateRegistry.load(SYSTEM_PAGE_TEMPLATES_DIR, dir);

    expect(registry.getTemplate('runbook').source).toBe('user');
    expect(registry.render('runbook', {}).title).toBe('Mine');
  });

  it('skips a malformed file instead of failing to start', async () => {
    await writeFile(join(dir, 'broken.md'), 'no frontmatter here', 'utf-8');
    await writeFile(
      join(dir, 'bad-json.md'),
      '---\n{not json}\n---\nbody\n',
      'utf-8',
    );

    const registry = PageTemplateRegistry.load(SYSTEM_PAGE_TEMPLATES_DIR, dir);

    expect(registry.listTemplates().length).toBe(SHIPPED.listTemplates().length);
  });

  it('tolerates a missing user directory', () => {
    expect(() =>
      PageTemplateRegistry.load(SYSTEM_PAGE_TEMPLATES_DIR, join(dir, 'absent')),
    ).not.toThrow();
  });
});

describe('parsePageTemplate', () => {
  it('rejects a file with no id', () => {
    expect(
      parsePageTemplate('---\n{"title":"T"}\n---\nbody', 'f.md', 'user'),
    ).toBeUndefined();
  });

  it('rejects a file with no title', () => {
    expect(
      parsePageTemplate('---\n{"id":"x"}\n---\nbody', 'f.md', 'user'),
    ).toBeUndefined();
  });

  it('defaults an unknown format to markdown rather than guessing storage', () => {
    const t = parsePageTemplate(
      '---\n{"id":"x","title":"T","format":"wiki"}\n---\nbody',
      'f.md',
      'user',
    );

    expect(t?.format).toBe('markdown');
  });
});
