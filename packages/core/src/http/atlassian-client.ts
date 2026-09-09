// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Shared HTTP client for Atlassian Cloud REST APIs.
 *
 * Jira and Confluence sit on the same host, authenticate with the same Basic
 * credentials, and rate-limit identically. Everything below the URL path is
 * therefore the same for both: auth header, exponential backoff on 429 and
 * 503, `Retry-After` handling, empty-body handling, and the decision of which
 * statuses are worth retrying.
 *
 * What differs is only which error class a status maps to, so that is the one
 * thing injected. Each connector supplies a mapper and keeps its own error
 * vocabulary; nothing else about transport is duplicated.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of retry attempts for transient failures. */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff (1s, 2s, 4s). */
const BASE_DELAY_MS = 1000;

/** Upper bound on a server-requested `Retry-After` delay. */
const MAX_RETRY_AFTER_MS = 30_000;

/** HTTP status codes eligible for retry. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Longest error body echoed back to the caller before truncation. */
const MAX_DETAIL_LENGTH = 200;

/** Promise-based sleep for backoff delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Credentials and host for one Atlassian site. */
export interface AtlassianSiteConfig {
  readonly url: string;
  readonly username: string;
  readonly api_token: string;
}

/** Context handed to an error mapper when a request fails. */
export interface HttpFailure {
  readonly status: number;
  /** Response body, truncated to a readable length. */
  readonly detail: string;
  readonly method: string;
  readonly path: string;
}

/**
 * Turns an HTTP failure into a product-specific error.
 *
 * Returning an error rather than throwing keeps the retry loop in charge of
 * *when* to raise: a mapped 429 is still retried, and only the last attempt's
 * error escapes.
 */
export type HttpErrorMapper = (failure: HttpFailure) => Error;

/** Marks a mapped error as worth retrying even though the status is fatal. */
export interface RetryPolicy {
  /** Statuses to retry in addition to 429 and 503. */
  readonly extraRetryable?: ReadonlySet<number>;
}

// ---------------------------------------------------------------------------
// AtlassianHttpClient
// ---------------------------------------------------------------------------

export class AtlassianHttpClient {
  readonly instanceUrl: string;
  private readonly authToken: string;
  private readonly mapError: HttpErrorMapper;
  private readonly retryable: ReadonlySet<number>;

  constructor(
    config: AtlassianSiteConfig,
    mapError: HttpErrorMapper,
    policy?: RetryPolicy,
  ) {
    this.instanceUrl = config.url;
    this.authToken = Buffer.from(
      `${config.username}:${config.api_token}`,
    ).toString('base64');
    this.mapError = mapError;
    this.retryable =
      policy?.extraRetryable === undefined
        ? RETRYABLE_STATUSES
        : new Set([...RETRYABLE_STATUSES, ...policy.extraRetryable]);
  }

  /** The `Authorization` header value used on every request. */
  get authorization(): string {
    return `Basic ${this.authToken}`;
  }

  /**
   * Send an authenticated JSON request.
   *
   * Returns the parsed body, or `undefined` for 204 and empty responses.
   */
  async requestJson<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.instanceUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authorization,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    return this.send<T>(
      url,
      {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      method,
      path,
    );
  }

  /**
   * Run a prepared request through the retry loop and status mapping.
   *
   * Exposed for requests this client cannot assemble itself, such as a
   * multipart upload whose body must not carry a JSON content type.
   */
  async send<T>(
    url: URL,
    fetchOptions: RequestInit,
    method: string,
    path: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url.toString(), fetchOptions);

      if (response.ok) {
        return AtlassianHttpClient.#parseBody<T>(response);
      }

      const detail = AtlassianHttpClient.#truncate(
        (await response.text()) || response.statusText,
      );
      const error = this.mapError({
        status: response.status,
        detail,
        method,
        path,
      });

      if (this.retryable.has(response.status) && attempt < MAX_RETRIES) {
        await sleep(
          AtlassianHttpClient.#backoffMs(
            response.headers.get('Retry-After'),
            attempt,
          ),
        );
        lastError = error;
        continue;
      }

      throw error;
    }

    throw (
      lastError ??
      this.mapError({
        status: 0,
        detail: 'Request failed after retries',
        method,
        path,
      })
    );
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Read a successful response body.
   *
   * 204 and an empty body both mean "no content", which several Atlassian
   * delete and label endpoints return. Anything else is parsed, and a parse
   * failure propagates rather than being swallowed: a malformed success body
   * is a real problem the caller should see.
   */
  static async #parseBody<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /** Honour `Retry-After` when present, otherwise back off exponentially. */
  static #backoffMs(retryAfter: string | null, attempt: number): number {
    if (retryAfter !== null) {
      const seconds = parseInt(retryAfter, 10);
      if (Number.isFinite(seconds)) {
        return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
      }
    }
    return BASE_DELAY_MS * Math.pow(2, attempt);
  }

  static #truncate(raw: string): string {
    return raw.length > MAX_DETAIL_LENGTH
      ? `${raw.slice(0, MAX_DETAIL_LENGTH)}...`
      : raw;
  }
}
