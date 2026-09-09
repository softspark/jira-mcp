// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Project-owned Confluence types.
 *
 * These are the lean shapes the connector returns. Raw REST response shapes
 * stay private to {@link ../confluence/connector.ts} so the rest of the code
 * never depends on Atlassian's field names or on which API version served a
 * given call.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

/** A Confluence space as returned by the v2 spaces endpoint. */
export interface ConfluenceSpace {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  /** `global` or `personal`. */
  readonly type: string;
  readonly homepageId?: string;
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Lightweight page record, used by search and listing calls. */
export interface ConfluencePage {
  readonly id: string;
  readonly title: string;
  readonly spaceId?: string;
  readonly spaceKey?: string;
  readonly parentId?: string;
  readonly status: string;
  readonly version: number;
  readonly url?: string;
}

/** Full page record including its body. */
export interface ConfluencePageDetail extends ConfluencePage {
  readonly body: string;
  /** Which representation `body` is in. */
  readonly bodyFormat: 'markdown' | 'storage';
  /**
   * Whether the stored page contains macros, page links or attachment
   * references. When true, a markdown edit would delete them, so the page
   * must be edited as storage.
   */
  readonly hasStorageMarkup: boolean;
  readonly authorId?: string;
  readonly createdAt?: string;
  readonly labels: readonly ConfluenceLabel[];
}

/** Result of creating or updating a page. */
export interface PageWriteResult {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------

/**
 * A blog post.
 *
 * Structurally a page without a parent: blog posts live directly in a space,
 * are ordered by date rather than by tree position, and cannot be re-parented.
 */
export interface ConfluenceBlogPost {
  readonly id: string;
  readonly title: string;
  readonly spaceId?: string;
  readonly status: string;
  readonly version: number;
  readonly authorId?: string;
  readonly createdAt?: string;
  readonly url?: string;
}

/** Full blog post including the body converted to markdown. */
export interface ConfluenceBlogPostDetail extends ConfluenceBlogPost {
  readonly body: string;
  readonly labels: readonly ConfluenceLabel[];
}

// ---------------------------------------------------------------------------
// Whiteboards
// ---------------------------------------------------------------------------

/**
 * A whiteboard.
 *
 * Only the container is reachable over the API. Whiteboard content is a
 * collaborative binary document with no REST representation, so these records
 * carry a title and a position in the tree and nothing else.
 */
export interface ConfluenceWhiteboard {
  readonly id: string;
  readonly title: string;
  readonly spaceId?: string;
  readonly parentId?: string;
  readonly url?: string;
}

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

/** A user named in a content restriction. */
export interface RestrictionUser {
  readonly accountId: string;
  readonly displayName?: string;
}

/** A group named in a content restriction. */
export interface RestrictionGroup {
  readonly id?: string;
  readonly name?: string;
}

/** Who may perform one operation on a page. */
export interface RestrictionSet {
  readonly users: readonly RestrictionUser[];
  readonly groups: readonly RestrictionGroup[];
}

/**
 * Page restrictions, by operation.
 *
 * Empty sets mean the page inherits space permissions, which is not the same
 * as "nobody may read it".
 */
export interface ConfluenceRestrictions {
  readonly read: RestrictionSet;
  readonly update: RestrictionSet;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** A footer comment on a page, body already converted to markdown. */
export interface ConfluenceComment {
  readonly id: string;
  readonly pageId?: string;
  readonly parentCommentId?: string;
  readonly version: number;
  readonly body: string;
  readonly authorId?: string;
  readonly url?: string;
}

/**
 * An inline comment, anchored to highlighted text in the page body.
 *
 * `textSelection` is the highlighted passage. `resolutionStatus` is `dangling`
 * when the anchored text no longer exists after an edit, which is how review
 * threads get orphaned.
 */
export interface ConfluenceInlineComment extends ConfluenceComment {
  readonly resolutionStatus?: string;
  readonly textSelection?: string;
}

// ---------------------------------------------------------------------------
// Labels and attachments
// ---------------------------------------------------------------------------

/** A label attached to a page. */
export interface ConfluenceLabel {
  readonly id: string;
  readonly name: string;
  readonly prefix?: string;
}

/** Attachment metadata. Binary content is never inlined into a tool result. */
export interface ConfluenceAttachment {
  readonly id: string;
  readonly title: string;
  readonly mediaType?: string;
  readonly fileSize?: number;
  readonly version: number;
  /** Absolute URL for downloading the attachment. */
  readonly downloadUrl?: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** One hit from a CQL search, with the excerpt Confluence generated. */
export interface ConfluenceSearchHit {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly spaceKey?: string;
  readonly excerpt?: string;
  readonly lastModified?: string;
  readonly url?: string;
}
