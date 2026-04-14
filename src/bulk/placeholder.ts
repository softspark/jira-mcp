/**
 * Placeholder replacement engine for bulk task templates.
 *
 * Supports {MONTH}, {YEAR}, and {DATE} placeholders in any serializable
 * value. Replacement is performed via JSON round-tripping so nested
 * objects and arrays are handled automatically.
 */

/** Values available for placeholder replacement. */
export interface PlaceholderValues {
  /** Month and year, e.g. "04.2026". */
  readonly MONTH: string;
  /** Four-digit year, e.g. "2026". */
  readonly YEAR: string;
  /** ISO date, e.g. "2026-04-13". */
  readonly DATE: string;
}

/**
 * Build placeholder values for the given date (defaults to now).
 *
 * @param date - Reference date for placeholder values.
 * @returns Placeholder values derived from the date.
 */
export function getCurrentPlaceholders(date?: Date): PlaceholderValues {
  const d = date ?? new Date();
  return {
    MONTH: `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`,
    YEAR: String(d.getFullYear()),
    DATE: d.toISOString().slice(0, 10),
  };
}

/**
 * Replace `{MONTH}`, `{YEAR}`, and `{DATE}` placeholders in a serializable value.
 *
 * The value is JSON-stringified, placeholders are replaced in the string
 * representation, and the result is parsed back. This handles deeply nested
 * objects, arrays, and plain strings uniformly.
 *
 * @param value - Any JSON-serializable value containing placeholders.
 * @param values - Placeholder values to substitute (defaults to current date).
 * @returns The value with all placeholders replaced.
 */
export function replacePlaceholders<T>(value: T, values?: PlaceholderValues): T {
  const v = values ?? getCurrentPlaceholders();
  let json = JSON.stringify(value);
  json = json.replaceAll('{MONTH}', v.MONTH);
  json = json.replaceAll('{YEAR}', v.YEAR);
  json = json.replaceAll('{DATE}', v.DATE);
  return JSON.parse(json) as T;
}
