/**
 * Argument extraction helpers for MCP tool dispatch.
 *
 * Each function converts an `unknown` argument value into a typed
 * result, returning `undefined` for optional params or throwing
 * for required params that are missing or have the wrong type.
 *
 * @module
 */

/**
 * Extract a string value or return undefined.
 */
export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extract a required string value, throwing on missing or wrong type.
 */
export function requireString(value: unknown, paramName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required parameter: ${paramName}`);
  }
  return value;
}

/**
 * Extract an optional number value or return undefined.
 */
export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Extract an optional boolean value or return undefined.
 */
export function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Extract an optional string array from an unknown value.
 */
export function asOptionalStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

/**
 * Extract an optional Record<string, string> from an unknown value.
 */
export function asOptionalRecord(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = String(v);
  }
  return result;
}
