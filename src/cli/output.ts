/**
 * Simple output helpers for CLI commands.
 *
 * No external dependencies (no chalk/picocolors). Keeps the CLI
 * lightweight and avoids color-support detection issues in CI.
 *
 * @module
 */

/** Print an informational message to stdout. */
export function info(msg: string): void {
  console.log(msg);
}

/** Print a warning to stderr. */
export function warn(msg: string): void {
  console.warn(`Warning: ${msg}`);
}

/** Print an error to stderr. */
export function error(msg: string): void {
  console.error(`Error: ${msg}`);
}

/**
 * Print a simple columnar table to stdout.
 *
 * Column widths are auto-calculated from the widest value in each
 * column (including the header).
 */
export function table(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const headerLine = headers
    .map((h, i) => h.padEnd(widths[i] ?? 0))
    .join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(headerLine);
  console.log(separator);

  for (const row of rows) {
    console.log(
      row.map((c, i) => (c ?? '').padEnd(widths[i] ?? 0)).join('  '),
    );
  }
}
