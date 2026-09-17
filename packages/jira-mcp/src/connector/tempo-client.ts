// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tempo Cloud REST API v4 client.
 *
 * One client serves one Jira site: Tempo tokens are issued per site, so the
 * instance pool creates a client per configured Jira URL that carries a
 * `tempo_token`. Transport (bearer auth, retry on 429 and 503, `Retry-After`)
 * is the shared {@link AtlassianHttpClient}; this class owns only the paths,
 * the pagination loop and which error a status means.
 *
 * @module
 */

import type { HttpFailure } from '@softspark/atlassian-mcp-core';
import {
  AtlassianHttpClient,
  TempoAuthenticationError,
  TempoConnectionError,
  TempoPermissionError,
} from '@softspark/atlassian-mcp-core';

import type { TempoWorklog, TempoWorklogQuery } from './tempo-types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Worklogs requested per page.
 *
 * v4 accepts up to 5000, but a page that size is several megabytes of JSON
 * for one `await`; 1000 keeps memory flat and a month of a busy project still
 * fits in one or two calls.
 */
const PAGE_SIZE = 1000;

/**
 * Hard stop on a single query.
 *
 * A date range wide enough to cross this is a report Tempo's own UI would
 * refuse to render. Failing loudly beats returning a silently truncated
 * total that somebody then bills from.
 */
const MAX_WORKLOGS = 50_000;

// ---------------------------------------------------------------------------
// Raw Tempo REST API response shapes (internal only)
// ---------------------------------------------------------------------------

interface RawTempoWorklog {
  readonly tempoWorklogId?: number;
  readonly issue?: { readonly id?: number; readonly self?: string };
  readonly timeSpentSeconds?: number;
  readonly billableSeconds?: number;
  readonly startDate?: string;
  readonly startTime?: string;
  readonly description?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly author?: { readonly accountId?: string; readonly self?: string };
}

interface RawTempoPage {
  readonly metadata?: {
    readonly count?: number;
    readonly offset?: number;
    readonly limit?: number;
    readonly next?: string;
  };
  readonly results?: readonly RawTempoWorklog[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What a {@link TempoClient} needs to reach one site's Tempo. */
export interface TempoClientConfig {
  /** Base URL including the version segment, e.g. `https://api.tempo.io/4`. */
  readonly apiUrl: string;
  readonly token: string;
}

// ---------------------------------------------------------------------------
// TempoClient
// ---------------------------------------------------------------------------

/** Map a Tempo HTTP failure onto this package's error vocabulary. */
function mapTempoError({ status, detail }: HttpFailure): Error {
  if (status === 401) {
    return new TempoAuthenticationError(
      `Tempo rejected the API token: ${detail}`,
    );
  }
  if (status === 403) {
    return new TempoPermissionError(`Tempo permission denied: ${detail}`);
  }
  return new TempoConnectionError(`Tempo API error (${status}): ${detail}`);
}

/**
 * Normalise the base URL so relative paths keep the version segment.
 *
 * `new URL('worklogs', 'https://api.tempo.io/4')` resolves to
 * `https://api.tempo.io/worklogs`, because a base without a trailing slash
 * treats `4` as a file name. With the slash, `4` is a directory and the path
 * lands under it. Every path in this class is therefore relative and without
 * a leading slash.
 */
function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

export class TempoClient {
  readonly apiUrl: string;
  private readonly http: AtlassianHttpClient;

  constructor(config: TempoClientConfig) {
    this.apiUrl = withTrailingSlash(config.apiUrl);
    this.http = new AtlassianHttpClient(
      { url: this.apiUrl, bearer_token: config.token },
      mapTempoError,
    );
  }

  // -----------------------------------------------------------------------
  // Worklogs
  // -----------------------------------------------------------------------

  /**
   * Fetch every worklog matching the query, following pagination to the end.
   *
   * With `authorAccountId` the call goes to `worklogs/user/{accountId}`,
   * which only filters by date; otherwise to `worklogs`, where `issueId` and
   * `projectId` may repeat. Both endpoints share the page envelope.
   *
   * @throws {TempoConnectionError} When the result would exceed
   *   {@link MAX_WORKLOGS}; narrow the date range instead.
   */
  async getWorklogs(query: TempoWorklogQuery): Promise<TempoWorklog[]> {
    const params = new URLSearchParams({ from: query.from, to: query.to });

    let path: string;
    if (query.authorAccountId !== undefined) {
      path = `worklogs/user/${encodeURIComponent(query.authorAccountId)}`;
    } else {
      path = 'worklogs';
      for (const id of query.issueIds ?? []) {
        params.append('issueId', id);
      }
      for (const id of query.projectIds ?? []) {
        params.append('projectId', id);
      }
    }

    return this.#fetchAllPages(path, params);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Walk `offset`/`limit` pages until a short page or a missing `next` link.
   *
   * Both conditions are checked because Tempo has shipped pages with a
   * `next` link on the last page and, in other versions, without one on a
   * full middle page. A short page is the one signal that has held.
   */
  async #fetchAllPages(
    path: string,
    params: URLSearchParams,
  ): Promise<TempoWorklog[]> {
    const worklogs: TempoWorklog[] = [];
    let offset = 0;

    for (;;) {
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const page = await this.http.requestJson<RawTempoPage>(
        'GET',
        `${path}?${params.toString()}`,
      );
      const results = page.results ?? [];

      for (const raw of results) {
        worklogs.push(TempoClient.#toWorklog(raw));
      }

      if (worklogs.length > MAX_WORKLOGS) {
        throw new TempoConnectionError(
          `Query matched more than ${String(MAX_WORKLOGS)} worklogs. Narrow the date range or add a project, task or user filter.`,
        );
      }

      if (results.length < PAGE_SIZE || page.metadata?.next === undefined) {
        return worklogs;
      }
      offset += results.length;
    }
  }

  static #toWorklog(raw: RawTempoWorklog): TempoWorklog {
    return {
      id: raw.tempoWorklogId !== undefined ? String(raw.tempoWorklogId) : '',
      issueId: raw.issue?.id !== undefined ? String(raw.issue.id) : '',
      authorAccountId: raw.author?.accountId ?? '',
      timeSpentSeconds: raw.timeSpentSeconds ?? 0,
      billableSeconds: raw.billableSeconds ?? 0,
      startDate: raw.startDate ?? '',
      startTime: raw.startTime ?? null,
      description: raw.description ?? '',
      createdAt: raw.createdAt ?? '',
      updatedAt: raw.updatedAt ?? '',
    };
  }
}
