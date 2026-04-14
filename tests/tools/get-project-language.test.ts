/**
 * Tests for the get_project_language tool handler.
 */

import { describe, it, expect } from 'vitest';

import { handleGetProjectLanguage } from '../../src/tools/get-project-language';
import { createMergedConfig } from '../fixtures/config';

describe('handleGetProjectLanguage', () => {
  it('returns project-level language when set', async () => {
    const config = createMergedConfig({
      projects: {
        DEVOPS: {
          url: 'https://test.atlassian.net',
          username: 'u@test.com',
          api_token: 'tok',
          language: 'en',
        },
      },
      default_language: 'pl',
    });

    const result = await handleGetProjectLanguage(
      { project_key: 'DEVOPS' },
      { config },
    );

    expect(result.content[0]?.text).toContain('"language": "en"');
    expect(result.content[0]?.text).toContain('"source": "project"');
  });

  it('falls back to default language for unknown project', async () => {
    const config = createMergedConfig({ default_language: 'de' });

    const result = await handleGetProjectLanguage(
      { project_key: 'NOPROJ' },
      { config },
    );

    expect(result.content[0]?.text).toContain('"language": "de"');
    expect(result.content[0]?.text).toContain('"source": "default"');
  });

  it('returns default language for unknown project', async () => {
    const config = createMergedConfig({ default_language: 'fr' });

    const result = await handleGetProjectLanguage(
      { project_key: 'UNKNOWN' },
      { config },
    );

    expect(result.content[0]?.text).toContain('"language": "fr"');
  });
});
