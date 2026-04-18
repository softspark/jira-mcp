/**
 * Tests for JQL escape utility.
 *
 * escapeJql is meant for values embedded inside a double-quoted JQL string
 * literal (e.g. `assignee = "<here>"`). Over-escaping characters like `-`
 * produces invalid JQL escape sequences that Jira rejects.
 */

import { describe, it, expect } from 'vitest';

import { escapeJql } from '../../src/utils/jql';

describe('escapeJql', () => {
  it('leaves plain emails untouched', () => {
    expect(escapeJql('user@example.com')).toBe('user@example.com');
  });

  it('leaves hyphens untouched (would become invalid \\- inside quotes)', () => {
    expect(escapeJql('lukasz-krzemien@softspark.eu')).toBe(
      'lukasz-krzemien@softspark.eu',
    );
  });

  it('leaves JQL operators untouched when they are literal inside quotes', () => {
    // +, &, |, !, (, ), {, }, [, ], ^, ~, *, ?, : are all literal in quoted strings.
    expect(escapeJql('a+b&c|d!e(f)g{h}i[j]k^l~m*n?o:p')).toBe(
      'a+b&c|d!e(f)g{h}i[j]k^l~m*n?o:p',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeJql('title with "quotes"')).toBe('title with \\"quotes\\"');
  });

  it('escapes backslashes', () => {
    expect(escapeJql('path\\to\\thing')).toBe('path\\\\to\\\\thing');
  });

  it('escapes backslash before double quote (order matters)', () => {
    // Input: \"
    // Output: \\\" (both chars escaped independently)
    expect(escapeJql('\\"')).toBe('\\\\\\"');
  });

  it('is idempotent on strings with no special chars', () => {
    const value = 'assignee = currentUser AND status != Done';
    expect(escapeJql(value)).toBe(value);
  });
});
