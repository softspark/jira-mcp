import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ConfluenceSpaceInstanceConfig, AdfDocument, ConfluenceConfig, ToolResult, ToolDefinition } from '@softspark/atlassian-mcp-core';

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
/** A Confluence space as returned by the v2 spaces endpoint. */
interface ConfluenceSpace {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    /** `global` or `personal`. */
    readonly type: string;
    readonly homepageId?: string;
    readonly url?: string;
}
/** Lightweight page record, used by search and listing calls. */
interface ConfluencePage {
    readonly id: string;
    readonly title: string;
    readonly spaceId?: string;
    readonly spaceKey?: string;
    readonly parentId?: string;
    readonly status: string;
    readonly version: number;
    readonly url?: string;
}
/** Result of creating or updating a page. */
interface PageWriteResult {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    readonly url?: string;
}
/**
 * A blog post.
 *
 * Structurally a page without a parent: blog posts live directly in a space,
 * are ordered by date rather than by tree position, and cannot be re-parented.
 */
interface ConfluenceBlogPost {
    readonly id: string;
    readonly title: string;
    readonly spaceId?: string;
    readonly status: string;
    readonly version: number;
    readonly authorId?: string;
    readonly createdAt?: string;
    readonly url?: string;
}
/**
 * A whiteboard.
 *
 * Only the container is reachable over the API. Whiteboard content is a
 * collaborative binary document with no REST representation, so these records
 * carry a title and a position in the tree and nothing else.
 */
interface ConfluenceWhiteboard {
    readonly id: string;
    readonly title: string;
    readonly spaceId?: string;
    readonly parentId?: string;
    readonly url?: string;
}
/** A user named in a content restriction. */
interface RestrictionUser {
    readonly accountId: string;
    readonly displayName?: string;
}
/** A group named in a content restriction. */
interface RestrictionGroup {
    readonly id?: string;
    readonly name?: string;
}
/** Who may perform one operation on a page. */
interface RestrictionSet {
    readonly users: readonly RestrictionUser[];
    readonly groups: readonly RestrictionGroup[];
}
/**
 * Page restrictions, by operation.
 *
 * Empty sets mean the page inherits space permissions, which is not the same
 * as "nobody may read it".
 */
interface ConfluenceRestrictions {
    readonly read: RestrictionSet;
    readonly update: RestrictionSet;
}
/** A footer comment on a page, body already converted to markdown. */
interface ConfluenceComment {
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
interface ConfluenceInlineComment extends ConfluenceComment {
    readonly resolutionStatus?: string;
    readonly textSelection?: string;
}
/** A label attached to a page. */
interface ConfluenceLabel {
    readonly id: string;
    readonly name: string;
    readonly prefix?: string;
}
/** Attachment metadata. Binary content is never inlined into a tool result. */
interface ConfluenceAttachment {
    readonly id: string;
    readonly title: string;
    readonly mediaType?: string;
    readonly fileSize?: number;
    readonly version: number;
    /** Absolute URL for downloading the attachment. */
    readonly downloadUrl?: string;
}
/** One hit from a CQL search, with the excerpt Confluence generated. */
interface ConfluenceSearchHit {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly spaceKey?: string;
    readonly excerpt?: string;
    readonly lastModified?: string;
    readonly url?: string;
}

/** Body representation used for markdown-backed reads and writes. */
declare const ADF = "atlas_doc_format";
/**
 * Confluence's own storage format: XHTML carrying macros, layouts, page links
 * and attachment references. Anything authored in the Confluence editor, or
 * by a pages-as-code pipeline, is stored this way.
 */
declare const STORAGE = "storage";
/** The two body representations this connector reads and writes. */
type BodyFormat = typeof ADF | typeof STORAGE;
declare class ConfluenceConnector {
    private readonly http;
    readonly instanceUrl: string;
    /**
     * Space key to numeric space id, resolved lazily.
     *
     * The v2 API addresses spaces by id while humans and config use the key, so
     * every write needs one extra lookup. Space ids never change, so caching
     * them for the process lifetime is safe.
     */
    private readonly spaceIdByKey;
    constructor(config: ConfluenceSpaceInstanceConfig);
    /**
     * Send an authenticated request to the Confluence REST API.
     *
     * Transport concerns live in {@link AtlassianHttpClient}, shared with the
     * Jira connector. Status-to-error mapping stays in
     * {@link mapConfluenceError}.
     */
    private request;
    /**
     * Follow `_links.next` until `limit` items are collected.
     *
     * v2 paginates with an opaque cursor rather than an offset, so the only way
     * to reach page two is to follow the link the server hands back.
     */
    private collect;
    /**
     * Resolve a Confluence link against the site's `/wiki` context path.
     *
     * The API returns links like `/spaces/DOCS/pages/77`, rooted at the wiki
     * context rather than at the host. Handing that to `new URL` as-is would
     * resolve it against the origin and silently drop `/wiki`, producing a link
     * that 404s in the browser. The leading slash is stripped so the base's
     * path segment survives.
     */
    private wikiUrl;
    /** Turn a relative `_links.webui` into an absolute browser URL. */
    private absoluteUrl;
    /**
     * Extract the ADF document from a response body.
     *
     * Returns `null` when the page carries no ADF body, which happens for
     * content authored through legacy storage-format-only routes. Callers hand
     * `null` to `adfToMarkdown`, which already renders it as "(No content)".
     */
    private static extractAdf;
    /** Wrap an ADF document into the write shape the API expects. */
    private static adfBody;
    /** Wrap a raw storage-format body into the write shape the API expects. */
    private static storageBody;
    /**
     * Pick the write body from whichever representation the caller supplied.
     *
     * Exactly one must be present. Storage wins when both are, because storage
     * is the lossless one and silently preferring the lossy side is how content
     * gets destroyed.
     */
    private static writeBody;
    /** List spaces visible to the account. */
    listSpaces(limit?: number): Promise<ConfluenceSpace[]>;
    /**
     * Resolve a space key to its full record.
     *
     * @throws {PageNotFoundError} If no visible space carries that key.
     */
    getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace>;
    /** Resolve and memoise a space key to its numeric id. */
    resolveSpaceId(spaceKey: string): Promise<string>;
    private mapSpace;
    /**
     * Full-text search via CQL.
     *
     * Uses v1 `/wiki/rest/api/search`; v2 exposes no search endpoint.
     */
    searchPages(cql: string, limit?: number): Promise<ConfluenceSearchHit[]>;
    /**
     * Fetch one page.
     *
     * `format` selects the body representation the API returns. Ask for
     * `storage` when the body is going to be written back: storage is what
     * Confluence actually stores, and it is the only representation in which
     * macros, layouts, page links and attachment references survive a
     * read-modify-write intact.
     */
    getPage(pageId: string, format?: BodyFormat): Promise<{
        readonly page: ConfluencePage;
        readonly adf: AdfDocument | null;
        readonly storage: string | null;
        readonly authorId?: string;
        readonly createdAt?: string;
    }>;
    /** List direct children of a page, for walking the page tree. */
    getChildPages(pageId: string, limit?: number): Promise<ConfluencePage[]>;
    /** List pages in a space, addressed by space id. */
    getSpacePages(spaceId: string, limit?: number): Promise<ConfluencePage[]>;
    private mapPage;
    /** Create a page from an ADF document or a raw storage body. */
    createPage(input: {
        readonly spaceId: string;
        readonly title: string;
        readonly adf?: AdfDocument;
        readonly storage?: string;
        readonly parentId?: string;
        readonly status?: 'current' | 'draft';
    }): Promise<PageWriteResult>;
    /**
     * Update a page.
     *
     * `version` must be the current version number; the API is given
     * `version + 1`. Passing a stale number is what raises
     * {@link VersionConflictError} rather than silently overwriting.
     */
    updatePage(input: {
        readonly pageId: string;
        readonly title: string;
        readonly adf?: AdfDocument;
        readonly storage?: string;
        readonly version: number;
        readonly parentId?: string;
        readonly versionMessage?: string;
        readonly status?: 'current' | 'draft';
    }): Promise<PageWriteResult>;
    /** Move a page to a different parent within the same space. */
    movePage(input: {
        readonly pageId: string;
        readonly title: string;
        readonly adf?: AdfDocument;
        readonly storage?: string;
        readonly version: number;
        readonly parentId: string;
    }): Promise<PageWriteResult>;
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
    movePageToTarget(pageId: string, position: 'append' | 'before' | 'after', targetId: string): Promise<{
        readonly pageId: string;
    }>;
    /** Move a page to the trash. */
    deletePage(pageId: string): Promise<void>;
    /** List blog posts in a space, newest first as the API orders them. */
    getSpaceBlogPosts(spaceId: string, limit?: number): Promise<ConfluenceBlogPost[]>;
    /** Fetch one blog post with its ADF body. */
    getBlogPost(blogPostId: string): Promise<{
        readonly post: ConfluenceBlogPost;
        readonly adf: AdfDocument | null;
    }>;
    /** Create a blog post from an ADF document. */
    createBlogPost(input: {
        readonly spaceId: string;
        readonly title: string;
        readonly adf: AdfDocument;
        readonly status?: 'current' | 'draft';
    }): Promise<PageWriteResult>;
    /** Update a blog post. Same version contract as {@link updatePage}. */
    updateBlogPost(input: {
        readonly blogPostId: string;
        readonly title: string;
        readonly adf: AdfDocument;
        readonly version: number;
        readonly versionMessage?: string;
    }): Promise<PageWriteResult>;
    /** Move a blog post to the trash. */
    deleteBlogPost(blogPostId: string): Promise<void>;
    private mapBlogPost;
    /** Fetch whiteboard metadata. Whiteboard content has no REST representation. */
    getWhiteboard(whiteboardId: string): Promise<ConfluenceWhiteboard>;
    /** Create an empty whiteboard. There is no way to seed its content. */
    createWhiteboard(input: {
        readonly spaceId: string;
        readonly title?: string;
        readonly parentId?: string;
    }): Promise<ConfluenceWhiteboard>;
    /** Move a whiteboard to the trash. */
    deleteWhiteboard(whiteboardId: string): Promise<void>;
    private mapWhiteboard;
    private mapWriteResult;
    /** Read root footer comments on a page. */
    getFooterComments(pageId: string, limit?: number): Promise<{
        readonly comment: ConfluenceComment;
        readonly adf: AdfDocument | null;
    }[]>;
    /** Add a footer comment, optionally as a reply to another comment. */
    addFooterComment(input: {
        readonly pageId: string;
        readonly adf: AdfDocument;
        readonly parentCommentId?: string;
    }): Promise<ConfluenceComment>;
    /** Delete a footer comment. */
    deleteFooterComment(commentId: string): Promise<void>;
    private mapComment;
    /**
     * Read inline comments on a page.
     *
     * These are the review threads anchored to highlighted text, distinct from
     * the footer comments at the bottom of the page.
     */
    getInlineComments(pageId: string, limit?: number): Promise<{
        readonly comment: ConfluenceInlineComment;
        readonly adf: AdfDocument | null;
    }[]>;
    /**
     * Add an inline comment anchored to a passage, or reply to an existing one.
     *
     * A top-level inline comment must say which text it highlights, and how
     * many times that text occurs, so Confluence can anchor it to the right
     * occurrence. A reply must not carry those properties.
     */
    addInlineComment(input: {
        readonly pageId: string;
        readonly adf: AdfDocument;
        readonly textSelection?: string;
        readonly matchIndex?: number;
        readonly matchCount?: number;
        readonly parentCommentId?: string;
    }): Promise<ConfluenceInlineComment>;
    private mapInlineComment;
    /**
     * Read who may view and edit a page.
     *
     * Restrictions live only on v1. Empty sets mean the page inherits space
     * permissions, which is not the same as nobody having access.
     */
    getRestrictions(pageId: string): Promise<ConfluenceRestrictions>;
    /**
     * Replace the read and update restrictions on a page.
     *
     * This is a full replacement, not a merge: whatever is not listed loses
     * access. Passing no users and no groups for both operations removes the
     * restrictions entirely and the page falls back to space permissions.
     */
    setRestrictions(pageId: string, input: {
        readonly readAccountIds: readonly string[];
        readonly readGroupIds: readonly string[];
        readonly updateAccountIds: readonly string[];
        readonly updateGroupIds: readonly string[];
    }): Promise<ConfluenceRestrictions>;
    private static restrictionUpdate;
    private static mapRestrictionSet;
    /** Read the labels on a page. */
    getLabels(pageId: string, limit?: number): Promise<ConfluenceLabel[]>;
    /**
     * Add labels to a page.
     *
     * Label writes live only on v1: v2 exposes labels read-only.
     */
    addLabels(pageId: string, labels: readonly string[]): Promise<ConfluenceLabel[]>;
    /** Remove one label from a page. */
    removeLabel(pageId: string, name: string): Promise<void>;
    private static mapLabel;
    /** List attachment metadata for a page. Binary content is never fetched. */
    listAttachments(pageId: string, limit?: number): Promise<ConfluenceAttachment[]>;
    /**
     * Upload a file as a page attachment.
     *
     * Multipart upload exists only on v1, and Confluence rejects it without the
     * `X-Atlassian-Token: no-check` header (its XSRF guard). `allowDuplicate`
     * maps to the v1 create-or-update endpoint so re-uploading the same name
     * adds a version instead of failing.
     */
    uploadAttachment(input: {
        readonly pageId: string;
        readonly filename: string;
        /** File bytes. Build with `Uint8Array.from(buffer)` to satisfy Blob's type. */
        readonly content: Uint8Array<ArrayBuffer>;
        readonly mediaType?: string;
        readonly comment?: string;
    }): Promise<ConfluenceAttachment>;
}

/**
 * Pool of ConfluenceConnector instances keyed by site URL.
 *
 * Mirrors {@link ../connector/instance-pool.ts} with one deliberate
 * difference: Jira routes by parsing the project key out of an issue key
 * (`PROJ-123` → `PROJ`), but Confluence page ids are opaque numbers that
 * carry no space information. A page id alone therefore cannot pick a
 * connector, so callers either name a space or fall back to the default
 * space. On a single-site setup that fallback is exact; on a multi-site
 * setup naming the space is what keeps the call unambiguous.
 *
 * @module
 */

/** Metadata about a single Confluence site in the pool. */
interface PooledSite {
    readonly connector: ConfluenceConnector;
    readonly spaceKeys: readonly string[];
}
declare class ConfluenceInstancePool {
    #private;
    /** Connectors keyed by space key for fast lookup. */
    private readonly bySpace;
    /** Deduplicated sites keyed by URL. */
    private readonly byUrl;
    private readonly config;
    constructor(config: ConfluenceConfig);
    /**
     * Get the connector for a specific space key.
     *
     * @throws {ConfigValidationError} If the space key is not configured.
     */
    getConnector(spaceKey: string): ConfluenceConnector;
    /**
     * Resolve the space key a call should use.
     *
     * Order: explicit argument, then `default_space`, then the only configured
     * space. With several spaces and no default, an unnamed call is an error
     * rather than a guess, because writing a page into the wrong space is not
     * something the caller can see before it happens.
     *
     * @throws {ConfigValidationError} If nothing resolves.
     */
    resolveSpaceKey(spaceKey?: string): string;
    /** Get the connector for a call, applying {@link resolveSpaceKey} first. */
    getConnectorForSpace(spaceKey?: string): ConfluenceConnector;
    /** Get all unique sites with their associated space keys. */
    getSites(): ReadonlyMap<string, PooledSite>;
    /** Every configured space key, in configuration order. */
    getSpaceKeys(): readonly string[];
}

/**
 * Shared utilities for Confluence MCP tool handlers.
 *
 * Response formatting is reused from the Jira tool helpers so both servers
 * emit the same `{ success, ... }` envelope and the same error codes.
 *
 * @module
 */

/** Dependencies every Confluence tool handler receives. */
interface ConfluenceDeps {
    readonly pool: ConfluenceInstancePool;
    readonly config: ConfluenceConfig;
}

/**
 * Tool handlers: list_spaces, get_space_language
 *
 * @module
 */

interface ListSpacesArgs {
    readonly space_key?: string;
    readonly limit?: number;
}
/**
 * List Confluence spaces.
 *
 * Reports both what the site exposes and which keys are configured locally,
 * because only configured keys can be used to route a write.
 */
declare function handleListSpaces(args: ListSpacesArgs, deps: ConfluenceDeps): Promise<ToolResult>;

/**
 * MCP tool definitions for the Confluence MCP server.
 *
 * Names are deliberately page/space-shaped (`get_page`, not `get_content`)
 * so that a client running both servers side by side never has two tools
 * whose names could plausibly describe the same call.
 *
 * `space_key` is optional everywhere: it falls back to `default_space`, and
 * then to the single configured space. It becomes required only when several
 * spaces are configured without a default.
 *
 * @module
 */

declare const CONFLUENCE_TOOL_DEFINITIONS: readonly ToolDefinition[];

/**
 * MCP server for Confluence integration.
 *
 * A second stdio server in the same package, deliberately separate from
 * {@link ./server.ts}. Both read the same `~/.softspark/jira-mcp/config.json`
 * and the same credentials, but each advertises only its own tools: merging
 * them would put near-homonyms (`search_tasks` and `search_pages`,
 * `get_task_details` and `get_page`) in one list and make tool selection
 * measurably worse.
 *
 * Tool definitions live in {@link ./confluence/tools/definitions.ts}.
 *
 * @module
 */

declare function createConfluenceServer(): Server;
/**
 * Route one tool call to its handler.
 *
 * Never throws. Argument extraction runs before a handler's own try/catch, so
 * a missing parameter would otherwise escape as a transport-level JSON-RPC
 * error while every other failure arrives as a `{ success: false, code }`
 * envelope. Catching here gives the caller one error shape to read.
 *
 * Exported separately from {@link startConfluenceServer} so tests can drive
 * every tool without standing up a stdio transport.
 */
declare function dispatchConfluenceTool(name: string, args: Record<string, unknown>, deps: ConfluenceDeps): ReturnType<typeof handleListSpaces>;
/**
 * Boot the Confluence MCP server: load config, build the pool, register
 * handlers, and connect via stdio transport.
 */
declare function startConfluenceServer(): Promise<void>;

export { CONFLUENCE_TOOL_DEFINITIONS, createConfluenceServer, dispatchConfluenceTool, startConfluenceServer };
