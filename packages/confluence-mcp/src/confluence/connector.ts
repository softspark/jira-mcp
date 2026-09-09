// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Confluence API connector using Node.js built-in fetch.
 *
 * Handles a single Confluence site (one URL + one set of credentials) and
 * returns project-owned types rather than raw API shapes.
 *
 * **Two API versions on purpose.** Confluence Cloud v2 (`/wiki/api/v2`) is
 * the current API and covers pages, comments, spaces and attachments. It has
 * no full-text search and no label writes, so those calls go to v1
 * (`/wiki/rest/api`), which Atlassian still documents as the supported route
 * for CQL. Do not "unify" these onto v2: the endpoints do not exist there.
 *
 * Bodies are exchanged as `atlas_doc_format`, so the existing ADF layer is
 * reused unchanged. In that representation `body.value` is a JSON *string*
 * holding the ADF document, not a nested object.
 *
 * @module
 */

import { basename } from 'node:path';

import type {
  ConfluenceSpaceInstanceConfig,
  AdfDocument,
  HttpFailure,
} from '@softspark/atlassian-mcp-core';
import { AtlassianHttpClient } from '@softspark/atlassian-mcp-core';
import {
  ConfluenceAuthenticationError,
  ConfluenceConnectionError,
  ConfluencePermissionError,
  PageNotFoundError,
  VersionConflictError,
} from '@softspark/atlassian-mcp-core';
import type {
  ConfluenceAttachment,
  ConfluenceBlogPost,
  ConfluenceComment,
  ConfluenceInlineComment,
  ConfluenceLabel,
  ConfluencePage,
  ConfluenceRestrictions,
  ConfluenceSearchHit,
  ConfluenceSpace,
  ConfluenceWhiteboard,
  PageWriteResult,
  RestrictionSet,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default page size for list and search calls. */
const DEFAULT_LIMIT = 25;

/** Hard ceiling on results, to keep tool responses inside context budgets. */
const MAX_LIMIT = 250;

/** Body representation used for markdown-backed reads and writes. */
const ADF = 'atlas_doc_format';

/**
 * Confluence's own storage format: XHTML carrying macros, layouts, page links
 * and attachment references. Anything authored in the Confluence editor, or
 * by a pages-as-code pipeline, is stored this way.
 */
const STORAGE = 'storage';

/** The two body representations this connector reads and writes. */
export type BodyFormat = typeof ADF | typeof STORAGE;

/**
 * Markers that identify Confluence storage markup with no ADF equivalent.
 *
 * `ac:` is the macro/layout namespace (info panels, TOC, code blocks with a
 * language, expand blocks) and `ri:` is the resource-identifier namespace
 * (links to other pages, attachment references, images). A body containing
 * either cannot survive a markdown round-trip: the conversion keeps the
 * visible text and silently drops the structure.
 */
const STORAGE_ONLY_MARKUP = /<(ac|ri):[a-z-]+/i;

/** Whether a storage body contains markup a markdown round-trip would lose. */
export function hasStorageOnlyMarkup(storage: string | null): boolean {
  return storage !== null && STORAGE_ONLY_MARKUP.test(storage);
}

/** Reusable empty restriction set, returned after restrictions are cleared. */
const EMPTY_RESTRICTION_SET: RestrictionSet = { users: [], groups: [] };

// ---------------------------------------------------------------------------
// Raw Confluence REST response shapes (internal only)
// ---------------------------------------------------------------------------

interface RawBodyValue {
  readonly representation?: string;
  readonly value?: string;
}

interface RawNestedBody {
  readonly atlas_doc_format?: RawBodyValue;
  readonly storage?: RawBodyValue;
  readonly view?: RawBodyValue;
}

/** The write shape both create and update endpoints accept for a body. */
interface PageBody {
  readonly representation: BodyFormat;
  readonly value: string;
}

interface RawVersion {
  readonly number?: number;
  readonly createdAt?: string;
  readonly authorId?: string;
}

interface RawLinks {
  readonly webui?: string;
  readonly base?: string;
  readonly next?: string;
  readonly download?: string;
}

interface RawPage {
  readonly id?: string;
  readonly title?: string;
  readonly spaceId?: string;
  readonly parentId?: string | null;
  readonly status?: string;
  readonly authorId?: string;
  readonly createdAt?: string;
  readonly version?: RawVersion;
  readonly body?: RawNestedBody;
  readonly _links?: RawLinks;
}

interface RawSpace {
  readonly id?: string;
  readonly key?: string;
  readonly name?: string;
  readonly type?: string;
  readonly homepageId?: string;
  readonly _links?: RawLinks;
}

interface RawComment {
  readonly id?: string;
  readonly pageId?: string;
  readonly parentCommentId?: string;
  readonly version?: RawVersion;
  readonly body?: RawNestedBody;
  readonly _links?: RawLinks;
}

interface RawLabel {
  readonly id?: string;
  readonly name?: string;
  readonly prefix?: string;
}

interface RawInlineComment extends RawComment {
  readonly resolutionStatus?: string;
  readonly properties?: {
    readonly inlineOriginalSelection?: string;
    readonly inlineMarkerRef?: string;
  };
}

/** v1 restriction principal lists, as returned under `restrictions`. */
interface RawRestrictionEntry {
  readonly operation?: string;
  readonly restrictions?: {
    readonly user?: {
      readonly results?: readonly {
        readonly accountId?: string;
        readonly displayName?: string;
      }[];
    };
    readonly group?: {
      readonly results?: readonly {
        readonly id?: string;
        readonly name?: string;
      }[];
    };
  };
}

interface RawRestrictionsByOperation {
  readonly read?: RawRestrictionEntry;
  readonly update?: RawRestrictionEntry;
}

interface RawAttachment {
  readonly id?: string;
  readonly title?: string;
  readonly mediaType?: string;
  readonly fileSize?: number;
  readonly version?: RawVersion;
  readonly downloadLink?: string;
  readonly _links?: RawLinks;
}

/** Envelope shared by every paginated v2 collection endpoint. */
interface RawCollection<T> {
  readonly results?: readonly T[];
  readonly _links?: RawLinks;
}

/** v1 CQL search hit. */
interface RawSearchResult {
  readonly content?: {
    readonly id?: string;
    readonly title?: string;
    readonly type?: string;
    readonly space?: { readonly key?: string };
  };
  readonly title?: string;
  readonly excerpt?: string;
  readonly lastModified?: string;
  readonly url?: string;
  readonly resultGlobalContainer?: { readonly title?: string };
}

interface RawSearchResponse {
  readonly results?: readonly RawSearchResult[];
  readonly _links?: RawLinks;
}

/** v1 attachment-upload response wraps the created attachment in `results`. */
interface RawV1AttachmentResponse {
  readonly results?: readonly {
    readonly id?: string;
    readonly title?: string;
    readonly version?: { readonly number?: number };
    readonly extensions?: { readonly mediaType?: string; readonly fileSize?: number };
    readonly _links?: RawLinks;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags Confluence embeds in search excerpts. */
function stripExcerptMarkup(excerpt: string): string {
  return excerpt.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Clamp a caller-supplied limit into the range the API and context allow. */
function clampLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

// ---------------------------------------------------------------------------
// ConfluenceConnector
// ---------------------------------------------------------------------------

/**
 * Map a Confluence HTTP failure onto this package's error vocabulary.
 *
 * 404 deliberately says "or not visible": Confluence answers 404 for content
 * the account may not view, so absence and lack of permission are
 * indistinguishable from the response alone.
 */
function mapConfluenceError({ status, detail, method, path }: HttpFailure): Error {
  if (status === 401) {
    return new ConfluenceAuthenticationError(`Authentication failed: ${detail}`);
  }
  if (status === 403) {
    return new ConfluencePermissionError(`Permission denied: ${detail}`);
  }
  if (status === 404) {
    return new PageNotFoundError(
      `Not found (or not visible to this account): ${method} ${path} — ${detail}`,
    );
  }
  if (status === 409) {
    return new VersionConflictError(
      `Version conflict: the content changed since it was read. Re-read it and reapply the change. ${detail}`,
    );
  }
  return new ConfluenceConnectionError(
    `Confluence API error (${status}): ${detail}`,
  );
}

export class ConfluenceConnector {
  private readonly http: AtlassianHttpClient;
  readonly instanceUrl: string;

  /**
   * Space key to numeric space id, resolved lazily.
   *
   * The v2 API addresses spaces by id while humans and config use the key, so
   * every write needs one extra lookup. Space ids never change, so caching
   * them for the process lifetime is safe.
   */
  private readonly spaceIdByKey = new Map<string, string>();

  constructor(config: ConfluenceSpaceInstanceConfig) {
    this.instanceUrl = config.url;
    this.http = new AtlassianHttpClient(config, mapConfluenceError);
  }

  // -----------------------------------------------------------------------
  // HTTP helper
  // -----------------------------------------------------------------------

  /**
   * Send an authenticated request to the Confluence REST API.
   *
   * Transport concerns live in {@link AtlassianHttpClient}, shared with the
   * Jira connector. Status-to-error mapping stays in
   * {@link mapConfluenceError}.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string>,
  ): Promise<T> {
    return this.http.requestJson<T>(method, path, body, query);
  }

  /**
   * Follow `_links.next` until `limit` items are collected.
   *
   * v2 paginates with an opaque cursor rather than an offset, so the only way
   * to reach page two is to follow the link the server hands back.
   */
  private async collect<T>(
    path: string,
    query: Record<string, string>,
    limit: number,
  ): Promise<T[]> {
    const collected: T[] = [];
    let nextPath: string | undefined = path;
    let nextQuery: Record<string, string> | undefined = {
      ...query,
      limit: String(Math.min(limit, MAX_LIMIT)),
    };

    while (nextPath !== undefined && collected.length < limit) {
      const page: RawCollection<T> = await this.request<RawCollection<T>>(
        'GET',
        nextPath,
        undefined,
        nextQuery,
      );
      collected.push(...(page.results ?? []));

      const next = page._links?.next;
      if (next === undefined || (page.results ?? []).length === 0) {
        break;
      }
      // `next` already carries its own query string, including the cursor.
      nextPath = next;
      nextQuery = undefined;
    }

    return collected.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Link building
  // -----------------------------------------------------------------------

  /**
   * Resolve a Confluence link against the site's `/wiki` context path.
   *
   * The API returns links like `/spaces/DOCS/pages/77`, rooted at the wiki
   * context rather than at the host. Handing that to `new URL` as-is would
   * resolve it against the origin and silently drop `/wiki`, producing a link
   * that 404s in the browser. The leading slash is stripped so the base's
   * path segment survives.
   */
  private wikiUrl(relative: string, base?: string): string | undefined {
    if (relative.length === 0) {
      return undefined;
    }
    // An already-absolute link needs no resolution.
    if (/^https?:\/\//i.test(relative)) {
      return relative;
    }

    const root = base ?? `${this.instanceUrl.replace(/\/$/, '')}/wiki`;
    try {
      return new URL(
        relative.replace(/^\//, ''),
        `${root.replace(/\/$/, '')}/`,
      ).toString();
    } catch {
      return undefined;
    }
  }

  /** Turn a relative `_links.webui` into an absolute browser URL. */
  private absoluteUrl(links: RawLinks | undefined): string | undefined {
    const relative = links?.webui ?? links?.download;
    if (relative === undefined) {
      return undefined;
    }
    return this.wikiUrl(relative, links?.base);
  }

  // -----------------------------------------------------------------------
  // Body mapping
  // -----------------------------------------------------------------------

  /**
   * Extract the ADF document from a response body.
   *
   * Returns `null` when the page carries no ADF body, which happens for
   * content authored through legacy storage-format-only routes. Callers hand
   * `null` to `adfToMarkdown`, which already renders it as "(No content)".
   */
  private static extractAdf(body: RawNestedBody | undefined): AdfDocument | null {
    const value = body?.atlas_doc_format?.value;
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }
    try {
      return JSON.parse(value) as AdfDocument;
    } catch {
      return null;
    }
  }

  /** Wrap an ADF document into the write shape the API expects. */
  private static adfBody(adf: AdfDocument): PageBody {
    return { representation: ADF, value: JSON.stringify(adf) };
  }

  /** Wrap a raw storage-format body into the write shape the API expects. */
  private static storageBody(storage: string): PageBody {
    return { representation: STORAGE, value: storage };
  }

  /**
   * Pick the write body from whichever representation the caller supplied.
   *
   * Exactly one must be present. Storage wins when both are, because storage
   * is the lossless one and silently preferring the lossy side is how content
   * gets destroyed.
   */
  private static writeBody(input: {
    readonly adf?: AdfDocument;
    readonly storage?: string;
  }): PageBody {
    if (input.storage !== undefined) {
      return ConfluenceConnector.storageBody(input.storage);
    }
    if (input.adf !== undefined) {
      return ConfluenceConnector.adfBody(input.adf);
    }
    throw new ConfluenceConnectionError(
      'A page write needs a body: pass either adf or storage.',
    );
  }

  // -----------------------------------------------------------------------
  // Spaces
  // -----------------------------------------------------------------------

  /** List spaces visible to the account. */
  async listSpaces(limit?: number): Promise<ConfluenceSpace[]> {
    const raw = await this.collect<RawSpace>(
      '/wiki/api/v2/spaces',
      {},
      clampLimit(limit),
    );
    return raw.map((s) => this.mapSpace(s));
  }

  /**
   * Resolve a space key to its full record.
   *
   * @throws {PageNotFoundError} If no visible space carries that key.
   */
  async getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace> {
    const result = await this.request<RawCollection<RawSpace>>(
      'GET',
      '/wiki/api/v2/spaces',
      undefined,
      { keys: spaceKey, limit: '1' },
    );

    const first = result.results?.[0];
    if (!first?.id) {
      throw new PageNotFoundError(
        `Space '${spaceKey}' not found (or not visible to this account) on ${this.instanceUrl}`,
      );
    }

    const space = this.mapSpace(first);
    this.spaceIdByKey.set(spaceKey, space.id);
    return space;
  }

  /** Resolve and memoise a space key to its numeric id. */
  async resolveSpaceId(spaceKey: string): Promise<string> {
    const cached = this.spaceIdByKey.get(spaceKey);
    if (cached !== undefined) {
      return cached;
    }
    const space = await this.getSpaceByKey(spaceKey);
    return space.id;
  }

  private mapSpace(raw: RawSpace): ConfluenceSpace {
    return {
      id: raw.id ?? '',
      key: raw.key ?? '',
      name: raw.name ?? '',
      type: raw.type ?? 'global',
      ...(raw.homepageId !== undefined ? { homepageId: raw.homepageId } : {}),
      ...(this.absoluteUrl(raw._links) !== undefined
        ? { url: this.absoluteUrl(raw._links) }
        : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Pages — read
  // -----------------------------------------------------------------------

  /**
   * Full-text search via CQL.
   *
   * Uses v1 `/wiki/rest/api/search`; v2 exposes no search endpoint.
   */
  async searchPages(cql: string, limit?: number): Promise<ConfluenceSearchHit[]> {
    const response = await this.request<RawSearchResponse>(
      'GET',
      '/wiki/rest/api/search',
      undefined,
      { cql, limit: String(clampLimit(limit)) },
    );

    return (response.results ?? []).map((hit): ConfluenceSearchHit => {
      const excerpt = hit.excerpt ? stripExcerptMarkup(hit.excerpt) : undefined;
      const url = hit.url ? this.wikiUrl(hit.url) : undefined;

      return {
        id: hit.content?.id ?? '',
        title: hit.content?.title ?? hit.title ?? '',
        type: hit.content?.type ?? 'unknown',
        ...(hit.content?.space?.key !== undefined
          ? { spaceKey: hit.content.space.key }
          : {}),
        ...(excerpt !== undefined && excerpt.length > 0 ? { excerpt } : {}),
        ...(hit.lastModified !== undefined
          ? { lastModified: hit.lastModified }
          : {}),
        ...(url !== undefined ? { url } : {}),
      };
    });
  }

  /**
   * Fetch one page.
   *
   * `format` selects the body representation the API returns. Ask for
   * `storage` when the body is going to be written back: storage is what
   * Confluence actually stores, and it is the only representation in which
   * macros, layouts, page links and attachment references survive a
   * read-modify-write intact.
   */
  async getPage(
    pageId: string,
    format: BodyFormat = ADF,
  ): Promise<{
    readonly page: ConfluencePage;
    readonly adf: AdfDocument | null;
    readonly storage: string | null;
    readonly authorId?: string;
    readonly createdAt?: string;
  }> {
    const raw = await this.request<RawPage>(
      'GET',
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}`,
      undefined,
      { 'body-format': format },
    );

    return {
      page: this.mapPage(raw),
      adf: ConfluenceConnector.extractAdf(raw.body),
      storage: raw.body?.storage?.value ?? null,
      ...(raw.authorId !== undefined ? { authorId: raw.authorId } : {}),
      ...(raw.createdAt !== undefined ? { createdAt: raw.createdAt } : {}),
    };
  }

  /** List direct children of a page, for walking the page tree. */
  async getChildPages(pageId: string, limit?: number): Promise<ConfluencePage[]> {
    const raw = await this.collect<RawPage>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/children`,
      {},
      clampLimit(limit),
    );
    return raw.map((p) => this.mapPage(p));
  }

  /** List pages in a space, addressed by space id. */
  async getSpacePages(
    spaceId: string,
    limit?: number,
  ): Promise<ConfluencePage[]> {
    const raw = await this.collect<RawPage>(
      `/wiki/api/v2/spaces/${encodeURIComponent(spaceId)}/pages`,
      {},
      clampLimit(limit),
    );
    return raw.map((p) => this.mapPage(p));
  }

  private mapPage(raw: RawPage): ConfluencePage {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      title: raw.title ?? '',
      status: raw.status ?? 'current',
      version: raw.version?.number ?? 0,
      ...(raw.spaceId !== undefined ? { spaceId: raw.spaceId } : {}),
      ...(raw.parentId ? { parentId: raw.parentId } : {}),
      ...(url !== undefined ? { url } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Pages — write
  // -----------------------------------------------------------------------

  /** Create a page from an ADF document or a raw storage body. */
  async createPage(input: {
    readonly spaceId: string;
    readonly title: string;
    readonly adf?: AdfDocument;
    readonly storage?: string;
    readonly parentId?: string;
    readonly status?: 'current' | 'draft';
  }): Promise<PageWriteResult> {
    const raw = await this.request<RawPage>('POST', '/wiki/api/v2/pages', {
      spaceId: input.spaceId,
      status: input.status ?? 'current',
      title: input.title,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      body: ConfluenceConnector.writeBody(input),
    });

    return this.mapWriteResult(raw);
  }

  /**
   * Update a page.
   *
   * `version` must be the current version number; the API is given
   * `version + 1`. Passing a stale number is what raises
   * {@link VersionConflictError} rather than silently overwriting.
   */
  async updatePage(input: {
    readonly pageId: string;
    readonly title: string;
    readonly adf?: AdfDocument;
    readonly storage?: string;
    readonly version: number;
    readonly parentId?: string;
    readonly versionMessage?: string;
    readonly status?: 'current' | 'draft';
  }): Promise<PageWriteResult> {
    const raw = await this.request<RawPage>(
      'PUT',
      `/wiki/api/v2/pages/${encodeURIComponent(input.pageId)}`,
      {
        id: input.pageId,
        status: input.status ?? 'current',
        title: input.title,
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        body: ConfluenceConnector.writeBody(input),
        version: {
          number: input.version + 1,
          ...(input.versionMessage !== undefined
            ? { message: input.versionMessage }
            : {}),
        },
      },
    );

    return this.mapWriteResult(raw);
  }

  /** Move a page to a different parent within the same space. */
  async movePage(input: {
    readonly pageId: string;
    readonly title: string;
    readonly adf?: AdfDocument;
    readonly storage?: string;
    readonly version: number;
    readonly parentId: string;
  }): Promise<PageWriteResult> {
    return this.updatePage({
      ...input,
      versionMessage: `Moved under page ${input.parentId}`,
    });
  }

  /**
   * Move a page relative to a target page, across spaces if needed.
   *
   * The v2 update endpoint cannot change a page's space. This v1 endpoint
   * can, because it moves the page in the content tree rather than editing
   * its fields, and the space follows the new parent.
   *
   * `position` is `append` (become a child of the target), `before` or
   * `after` (become a sibling of the target). Never use `before`/`after`
   * against a top-level page: the result does not appear in the page tree.
   */
  async movePageToTarget(
    pageId: string,
    position: 'append' | 'before' | 'after',
    targetId: string,
  ): Promise<{ readonly pageId: string }> {
    const result = await this.request<{ readonly pageId?: string }>(
      'PUT',
      `/wiki/rest/api/content/${encodeURIComponent(pageId)}/move/${position}/${encodeURIComponent(targetId)}`,
    );
    return { pageId: result?.pageId ?? pageId };
  }

  /** Move a page to the trash. */
  async deletePage(pageId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}`,
    );
  }

  // -----------------------------------------------------------------------
  // Blog posts
  // -----------------------------------------------------------------------

  /** List blog posts in a space, newest first as the API orders them. */
  async getSpaceBlogPosts(
    spaceId: string,
    limit?: number,
  ): Promise<ConfluenceBlogPost[]> {
    const raw = await this.collect<RawPage>(
      `/wiki/api/v2/spaces/${encodeURIComponent(spaceId)}/blogposts`,
      {},
      clampLimit(limit),
    );
    return raw.map((b) => this.mapBlogPost(b));
  }

  /** Fetch one blog post with its ADF body. */
  async getBlogPost(blogPostId: string): Promise<{
    readonly post: ConfluenceBlogPost;
    readonly adf: AdfDocument | null;
  }> {
    const raw = await this.request<RawPage>(
      'GET',
      `/wiki/api/v2/blogposts/${encodeURIComponent(blogPostId)}`,
      undefined,
      { 'body-format': ADF },
    );

    return {
      post: this.mapBlogPost(raw),
      adf: ConfluenceConnector.extractAdf(raw.body),
    };
  }

  /** Create a blog post from an ADF document. */
  async createBlogPost(input: {
    readonly spaceId: string;
    readonly title: string;
    readonly adf: AdfDocument;
    readonly status?: 'current' | 'draft';
  }): Promise<PageWriteResult> {
    const raw = await this.request<RawPage>('POST', '/wiki/api/v2/blogposts', {
      spaceId: input.spaceId,
      status: input.status ?? 'current',
      title: input.title,
      body: ConfluenceConnector.adfBody(input.adf),
    });

    return this.mapWriteResult(raw);
  }

  /** Update a blog post. Same version contract as {@link updatePage}. */
  async updateBlogPost(input: {
    readonly blogPostId: string;
    readonly title: string;
    readonly adf: AdfDocument;
    readonly version: number;
    readonly versionMessage?: string;
  }): Promise<PageWriteResult> {
    const raw = await this.request<RawPage>(
      'PUT',
      `/wiki/api/v2/blogposts/${encodeURIComponent(input.blogPostId)}`,
      {
        id: input.blogPostId,
        status: 'current',
        title: input.title,
        body: ConfluenceConnector.adfBody(input.adf),
        version: {
          number: input.version + 1,
          ...(input.versionMessage !== undefined
            ? { message: input.versionMessage }
            : {}),
        },
      },
    );

    return this.mapWriteResult(raw);
  }

  /** Move a blog post to the trash. */
  async deleteBlogPost(blogPostId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/wiki/api/v2/blogposts/${encodeURIComponent(blogPostId)}`,
    );
  }

  private mapBlogPost(raw: RawPage): ConfluenceBlogPost {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      title: raw.title ?? '',
      status: raw.status ?? 'current',
      version: raw.version?.number ?? 0,
      ...(raw.spaceId !== undefined ? { spaceId: raw.spaceId } : {}),
      ...(raw.authorId !== undefined ? { authorId: raw.authorId } : {}),
      ...(raw.createdAt !== undefined ? { createdAt: raw.createdAt } : {}),
      ...(url !== undefined ? { url } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Whiteboards
  // -----------------------------------------------------------------------

  /** Fetch whiteboard metadata. Whiteboard content has no REST representation. */
  async getWhiteboard(whiteboardId: string): Promise<ConfluenceWhiteboard> {
    const raw = await this.request<RawPage>(
      'GET',
      `/wiki/api/v2/whiteboards/${encodeURIComponent(whiteboardId)}`,
    );
    return this.mapWhiteboard(raw);
  }

  /** Create an empty whiteboard. There is no way to seed its content. */
  async createWhiteboard(input: {
    readonly spaceId: string;
    readonly title?: string;
    readonly parentId?: string;
  }): Promise<ConfluenceWhiteboard> {
    const raw = await this.request<RawPage>(
      'POST',
      '/wiki/api/v2/whiteboards',
      {
        spaceId: input.spaceId,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      },
    );
    return this.mapWhiteboard(raw);
  }

  /** Move a whiteboard to the trash. */
  async deleteWhiteboard(whiteboardId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/wiki/api/v2/whiteboards/${encodeURIComponent(whiteboardId)}`,
    );
  }

  private mapWhiteboard(raw: RawPage): ConfluenceWhiteboard {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      title: raw.title ?? '',
      ...(raw.spaceId !== undefined ? { spaceId: raw.spaceId } : {}),
      ...(raw.parentId ? { parentId: raw.parentId } : {}),
      ...(url !== undefined ? { url } : {}),
    };
  }

  private mapWriteResult(raw: RawPage): PageWriteResult {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      title: raw.title ?? '',
      version: raw.version?.number ?? 0,
      ...(url !== undefined ? { url } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  /** Read root footer comments on a page. */
  async getFooterComments(
    pageId: string,
    limit?: number,
  ): Promise<{ readonly comment: ConfluenceComment; readonly adf: AdfDocument | null }[]> {
    const raw = await this.collect<RawComment>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/footer-comments`,
      { 'body-format': ADF },
      clampLimit(limit),
    );

    return raw.map((c) => ({
      comment: this.mapComment(c),
      adf: ConfluenceConnector.extractAdf(c.body),
    }));
  }

  /** Add a footer comment, optionally as a reply to another comment. */
  async addFooterComment(input: {
    readonly pageId: string;
    readonly adf: AdfDocument;
    readonly parentCommentId?: string;
  }): Promise<ConfluenceComment> {
    const raw = await this.request<RawComment>(
      'POST',
      '/wiki/api/v2/footer-comments',
      {
        pageId: input.pageId,
        ...(input.parentCommentId !== undefined
          ? { parentCommentId: input.parentCommentId }
          : {}),
        body: ConfluenceConnector.adfBody(input.adf),
      },
    );

    return this.mapComment(raw);
  }

  /** Delete a footer comment. */
  async deleteFooterComment(commentId: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/wiki/api/v2/footer-comments/${encodeURIComponent(commentId)}`,
    );
  }

  private mapComment(raw: RawComment): ConfluenceComment {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      version: raw.version?.number ?? 0,
      body: '',
      ...(raw.pageId !== undefined ? { pageId: raw.pageId } : {}),
      ...(raw.parentCommentId !== undefined
        ? { parentCommentId: raw.parentCommentId }
        : {}),
      ...(raw.version?.authorId !== undefined
        ? { authorId: raw.version.authorId }
        : {}),
      ...(url !== undefined ? { url } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Inline comments
  // -----------------------------------------------------------------------

  /**
   * Read inline comments on a page.
   *
   * These are the review threads anchored to highlighted text, distinct from
   * the footer comments at the bottom of the page.
   */
  async getInlineComments(
    pageId: string,
    limit?: number,
  ): Promise<
    { readonly comment: ConfluenceInlineComment; readonly adf: AdfDocument | null }[]
  > {
    const raw = await this.collect<RawInlineComment>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/inline-comments`,
      { 'body-format': ADF },
      clampLimit(limit),
    );

    return raw.map((c) => ({
      comment: this.mapInlineComment(c),
      adf: ConfluenceConnector.extractAdf(c.body),
    }));
  }

  /**
   * Add an inline comment anchored to a passage, or reply to an existing one.
   *
   * A top-level inline comment must say which text it highlights, and how
   * many times that text occurs, so Confluence can anchor it to the right
   * occurrence. A reply must not carry those properties.
   */
  async addInlineComment(input: {
    readonly pageId: string;
    readonly adf: AdfDocument;
    readonly textSelection?: string;
    readonly matchIndex?: number;
    readonly matchCount?: number;
    readonly parentCommentId?: string;
  }): Promise<ConfluenceInlineComment> {
    const isReply = input.parentCommentId !== undefined;

    const raw = await this.request<RawInlineComment>(
      'POST',
      '/wiki/api/v2/inline-comments',
      isReply
        ? {
            parentCommentId: input.parentCommentId,
            body: ConfluenceConnector.adfBody(input.adf),
          }
        : {
            pageId: input.pageId,
            body: ConfluenceConnector.adfBody(input.adf),
            inlineCommentProperties: {
              textSelection: input.textSelection ?? '',
              textSelectionMatchIndex: input.matchIndex ?? 0,
              textSelectionMatchCount: input.matchCount ?? 1,
            },
          },
    );

    return this.mapInlineComment(raw);
  }

  private mapInlineComment(raw: RawInlineComment): ConfluenceInlineComment {
    const url = this.absoluteUrl(raw._links);
    return {
      id: raw.id ?? '',
      version: raw.version?.number ?? 0,
      body: '',
      ...(raw.pageId !== undefined ? { pageId: raw.pageId } : {}),
      ...(raw.parentCommentId !== undefined
        ? { parentCommentId: raw.parentCommentId }
        : {}),
      ...(raw.version?.authorId !== undefined
        ? { authorId: raw.version.authorId }
        : {}),
      ...(raw.resolutionStatus !== undefined
        ? { resolutionStatus: raw.resolutionStatus }
        : {}),
      ...(raw.properties?.inlineOriginalSelection !== undefined
        ? { textSelection: raw.properties.inlineOriginalSelection }
        : {}),
      ...(url !== undefined ? { url } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Restrictions
  // -----------------------------------------------------------------------

  /**
   * Read who may view and edit a page.
   *
   * Restrictions live only on v1. Empty sets mean the page inherits space
   * permissions, which is not the same as nobody having access.
   */
  async getRestrictions(pageId: string): Promise<ConfluenceRestrictions> {
    const raw = await this.request<RawRestrictionsByOperation>(
      'GET',
      `/wiki/rest/api/content/${encodeURIComponent(pageId)}/restriction/byOperation`,
      undefined,
      { expand: 'restrictions.user,restrictions.group' },
    );

    return {
      read: ConfluenceConnector.mapRestrictionSet(raw?.read),
      update: ConfluenceConnector.mapRestrictionSet(raw?.update),
    };
  }

  /**
   * Replace the read and update restrictions on a page.
   *
   * This is a full replacement, not a merge: whatever is not listed loses
   * access. Passing no users and no groups for both operations removes the
   * restrictions entirely and the page falls back to space permissions.
   */
  async setRestrictions(
    pageId: string,
    input: {
      readonly readAccountIds: readonly string[];
      readonly readGroupIds: readonly string[];
      readonly updateAccountIds: readonly string[];
      readonly updateGroupIds: readonly string[];
    },
  ): Promise<ConfluenceRestrictions> {
    const isEmpty =
      input.readAccountIds.length === 0 &&
      input.readGroupIds.length === 0 &&
      input.updateAccountIds.length === 0 &&
      input.updateGroupIds.length === 0;

    if (isEmpty) {
      // PUT with empty lists is accepted but leaves the restriction records in
      // place; DELETE is what actually returns the page to space permissions.
      await this.request<undefined>(
        'DELETE',
        `/wiki/rest/api/content/${encodeURIComponent(pageId)}/restriction`,
      );
      return { read: EMPTY_RESTRICTION_SET, update: EMPTY_RESTRICTION_SET };
    }

    await this.request<unknown>(
      'PUT',
      `/wiki/rest/api/content/${encodeURIComponent(pageId)}/restriction`,
      [
        ConfluenceConnector.restrictionUpdate(
          'read',
          input.readAccountIds,
          input.readGroupIds,
        ),
        ConfluenceConnector.restrictionUpdate(
          'update',
          input.updateAccountIds,
          input.updateGroupIds,
        ),
      ],
    );

    // Read back rather than trusting the write echo: Confluence expands the
    // set with implicit grants (the page owner, space admins) that the caller
    // did not send and should see.
    return this.getRestrictions(pageId);
  }

  private static restrictionUpdate(
    operation: 'read' | 'update',
    accountIds: readonly string[],
    groupIds: readonly string[],
  ): Record<string, unknown> {
    return {
      operation,
      restrictions: {
        user: accountIds.map((accountId) => ({ type: 'known', accountId })),
        group: groupIds.map((id) => ({ type: 'group', id })),
      },
    };
  }

  private static mapRestrictionSet(
    raw: RawRestrictionEntry | undefined,
  ): RestrictionSet {
    return {
      users: (raw?.restrictions?.user?.results ?? []).map((u) => ({
        accountId: u.accountId ?? '',
        ...(u.displayName !== undefined ? { displayName: u.displayName } : {}),
      })),
      groups: (raw?.restrictions?.group?.results ?? []).map((g) => ({
        ...(g.id !== undefined ? { id: g.id } : {}),
        ...(g.name !== undefined ? { name: g.name } : {}),
      })),
    };
  }

  // -----------------------------------------------------------------------
  // Labels
  // -----------------------------------------------------------------------

  /** Read the labels on a page. */
  async getLabels(pageId: string, limit?: number): Promise<ConfluenceLabel[]> {
    const raw = await this.collect<RawLabel>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/labels`,
      {},
      clampLimit(limit),
    );
    return raw.map((l) => ConfluenceConnector.mapLabel(l));
  }

  /**
   * Add labels to a page.
   *
   * Label writes live only on v1: v2 exposes labels read-only.
   */
  async addLabels(
    pageId: string,
    labels: readonly string[],
  ): Promise<ConfluenceLabel[]> {
    const raw = await this.request<RawCollection<RawLabel>>(
      'POST',
      `/wiki/rest/api/content/${encodeURIComponent(pageId)}/label`,
      labels.map((name) => ({ prefix: 'global', name })),
    );
    return (raw.results ?? []).map((l) => ConfluenceConnector.mapLabel(l));
  }

  /** Remove one label from a page. */
  async removeLabel(pageId: string, name: string): Promise<void> {
    await this.request<undefined>(
      'DELETE',
      `/wiki/rest/api/content/${encodeURIComponent(pageId)}/label`,
      undefined,
      { name },
    );
  }

  private static mapLabel(raw: RawLabel): ConfluenceLabel {
    return {
      id: raw.id ?? '',
      name: raw.name ?? '',
      ...(raw.prefix !== undefined ? { prefix: raw.prefix } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------

  /** List attachment metadata for a page. Binary content is never fetched. */
  async listAttachments(
    pageId: string,
    limit?: number,
  ): Promise<ConfluenceAttachment[]> {
    const raw = await this.collect<RawAttachment>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}/attachments`,
      {},
      clampLimit(limit),
    );

    return raw.map((a): ConfluenceAttachment => {
      const download = a.downloadLink ?? a._links?.download;
      const url = download ? this.wikiUrl(download) : undefined;

      return {
        id: a.id ?? '',
        title: a.title ?? '',
        version: a.version?.number ?? 0,
        ...(a.mediaType !== undefined ? { mediaType: a.mediaType } : {}),
        ...(a.fileSize !== undefined ? { fileSize: a.fileSize } : {}),
        ...(url !== undefined ? { downloadUrl: url } : {}),
      };
    });
  }

  /**
   * Upload a file as a page attachment.
   *
   * Multipart upload exists only on v1, and Confluence rejects it without the
   * `X-Atlassian-Token: no-check` header (its XSRF guard). `allowDuplicate`
   * maps to the v1 create-or-update endpoint so re-uploading the same name
   * adds a version instead of failing.
   */
  async uploadAttachment(input: {
    readonly pageId: string;
    readonly filename: string;
    /** File bytes. Build with `Uint8Array.from(buffer)` to satisfy Blob's type. */
    readonly content: Uint8Array<ArrayBuffer>;
    readonly mediaType?: string;
    readonly comment?: string;
  }): Promise<ConfluenceAttachment> {
    const form = new FormData();
    const safeName = basename(input.filename);
    form.append(
      'file',
      new Blob([input.content], {
        type: input.mediaType ?? 'application/octet-stream',
      }),
      safeName,
    );
    if (input.comment !== undefined) {
      form.append('comment', input.comment);
    }
    form.append('minorEdit', 'true');

    const url = new URL(
      `/wiki/rest/api/content/${encodeURIComponent(input.pageId)}/child/attachment`,
      this.instanceUrl,
    );

    const raw = await this.http.send<RawV1AttachmentResponse>(
      url,
      {
        method: 'PUT',
        headers: {
          Authorization: this.http.authorization,
          Accept: 'application/json',
          // Confluence rejects multipart writes without this XSRF opt-out.
          'X-Atlassian-Token': 'no-check',
        },
        body: form,
      },
      'PUT',
      '/wiki/rest/api/content/{id}/child/attachment',
    );

    const created = raw.results?.[0];
    const download = created?._links?.download;
    const downloadUrl = download ? this.wikiUrl(download) : undefined;

    return {
      id: created?.id ?? '',
      title: created?.title ?? safeName,
      version: created?.version?.number ?? 1,
      ...(created?.extensions?.mediaType !== undefined
        ? { mediaType: created.extensions.mediaType }
        : {}),
      ...(created?.extensions?.fileSize !== undefined
        ? { fileSize: created.extensions.fileSize }
        : {}),
      ...(downloadUrl !== undefined ? { downloadUrl } : {}),
    };
  }
}
