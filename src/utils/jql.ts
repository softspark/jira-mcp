/**
 * JQL escaping utilities.
 *
 * @module
 */

/**
 * Escape a string for safe use in JQL text-search queries.
 *
 * JQL reserves: `+ - & | ! ( ) { } [ ] ^ ~ * ? \ :`
 * Also escapes double quotes for wrapping in `"..."`.
 */
export function escapeJql(value: string): string {
  return value.replace(/([+\-&|!(){}[\]^~*?\\:"])/g, '\\$1');
}
