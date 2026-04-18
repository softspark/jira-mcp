/**
 * JQL escaping utilities.
 *
 * @module
 */

/**
 * Escape a string for safe embedding inside a double-quoted JQL string literal.
 *
 * Inside `"..."` only backslash and double-quote need escaping. Other JQL
 * operators (`+ - & | ! ( ) { } [ ] ^ ~ * ? :`) are literal when quoted.
 * Escaping them with a leading `\` produces an invalid JQL escape sequence
 * (e.g. `\-` fails Jira parsing with "niedozwolona sekwencja modyfikacji").
 *
 * Callers MUST wrap the output in double quotes: `` `field = "${escapeJql(v)}"` ``.
 */
export function escapeJql(value: string): string {
  return value.replace(/([\\"])/g, '\\$1');
}
