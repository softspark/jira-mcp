// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * `@email` mentions in Jira markdown.
 *
 * ADF mentions carry an account id, which an agent rarely knows. This lets
 * it write `@jan.kowalski@firma.pl` instead: each address is looked up once
 * and rewritten to the `[~accountid:ID]` form that `markdownToAdf` turns
 * into a mention node. Code spans and fenced blocks are left alone, and
 * `\@` escapes a literal address.
 *
 * @module
 */

/** Looks up an account id by email; throws when nobody matches. */
export type FindUserByEmail = (email: string) => Promise<string>;

/** `@user@host.tld` not preceded by a word char, `@` or a backslash. */
const EMAIL_MENTION_RE =
  /(?<![\w\\@])@([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

/** Fenced code blocks (closed or running to the end) and inline code spans. */
const CODE_RE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;

/**
 * Rewrite every `@email` outside code to `[~accountid:ID]`.
 *
 * Returns the input unchanged, without any lookup, when it has none.
 * A failed lookup propagates, so a comment is never posted with a
 * mention silently dropped.
 */
export async function resolveEmailMentions(
  markdown: string,
  findUser: FindUserByEmail,
): Promise<string> {
  const emails = new Set<string>();
  mapProse(markdown, (prose) => {
    for (const match of prose.matchAll(EMAIL_MENTION_RE)) {
      emails.add((match[1] ?? '').toLowerCase());
    }
    return prose;
  });
  if (emails.size === 0) {
    return markdown;
  }

  const accountIds = new Map<string, string>();
  for (const email of emails) {
    accountIds.set(email, await findUser(email));
  }

  return mapProse(markdown, (prose) =>
    prose.replace(EMAIL_MENTION_RE, (whole, email: string) => {
      const accountId = accountIds.get(email.toLowerCase());
      return accountId === undefined ? whole : `[~accountid:${accountId}]`;
    }),
  );
}

/** Apply `transform` to the text between code spans and fenced blocks. */
function mapProse(markdown: string, transform: (prose: string) => string): string {
  let result = '';
  let last = 0;
  for (const code of markdown.matchAll(CODE_RE)) {
    const start = code.index;
    result += transform(markdown.slice(last, start)) + code[0];
    last = start + code[0].length;
  }
  return result + transform(markdown.slice(last));
}
