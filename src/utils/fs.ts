/**
 * Shared filesystem utilities.
 *
 * @module
 */

import { access, writeFile, readFile } from 'node:fs/promises';

/**
 * Check if a file or directory exists at the given path.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a file with owner-only permissions (0o600).
 * Use for credential files and other sensitive data.
 */
export async function writeSecureFile(
  filePath: string,
  content: string,
): Promise<void> {
  await writeFile(filePath, content, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Load and parse a JSON file.
 */
export async function loadJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

/**
 * Save a JSON file with pretty formatting.
 */
export async function saveJsonFile(
  filePath: string,
  data: unknown,
): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
