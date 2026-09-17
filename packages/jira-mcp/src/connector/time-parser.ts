// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Parse human-readable time strings into seconds, and format seconds back.
 *
 * Supports hours (h) and minutes (m) only. Days are explicitly rejected
 * per user requirement -- all time logging uses hours and minutes, and the
 * formatter follows the same rule so a value round-trips.
 *
 * @module
 */

const HOURS_RE = /(\d+)\s*h/i;
const MINUTES_RE = /(\d+)\s*m/i;
const DAYS_RE = /\d+\s*d/i;

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

/**
 * Format seconds as "2h 30m", the same shape {@link parseTimeSpent} reads.
 *
 * Seconds that do not fill a minute are dropped, matching how Jira and Tempo
 * display worklogs. Zero and negatives format as "0m" so a report row never
 * shows an empty cell.
 */
export function formatTimeSpent(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  );

  if (hours > 0 && minutes > 0) {
    return `${String(hours)}h ${String(minutes)}m`;
  }
  if (hours > 0) {
    return `${String(hours)}h`;
  }
  return `${String(minutes)}m`;
}

/**
 * Parse a time string like "2h 30m" to total seconds.
 *
 * Valid formats:
 *  - "2h"       -> 7200
 *  - "30m"      -> 1800
 *  - "2h 30m"   -> 9000
 *  - "2h30m"    -> 9000
 *
 * @throws {Error} If the format is invalid, contains days, or results in zero seconds.
 */
export function parseTimeSpent(timeString: string): number {
  const trimmed = timeString.trim();

  if (trimmed.length === 0) {
    throw new Error(
      "Invalid time format: empty string. Use: '2h', '30m', or '2h 30m'",
    );
  }

  // Reject days explicitly
  if (DAYS_RE.test(trimmed)) {
    throw new Error(
      "Days (d) not supported. Use hours (h) and minutes (m) only. " +
        "Example: '2h', '30m', or '2h 30m'",
    );
  }

  let totalSeconds = 0;

  const hoursMatch = HOURS_RE.exec(trimmed);
  if (hoursMatch?.[1]) {
    totalSeconds += parseInt(hoursMatch[1], 10) * SECONDS_PER_HOUR;
  }

  const minutesMatch = MINUTES_RE.exec(trimmed);
  if (minutesMatch?.[1]) {
    totalSeconds += parseInt(minutesMatch[1], 10) * SECONDS_PER_MINUTE;
  }

  if (totalSeconds === 0) {
    throw new Error(
      `Invalid time format: '${timeString}'. ` +
        "Use: '2h', '30m', or '2h 30m'",
    );
  }

  return totalSeconds;
}
