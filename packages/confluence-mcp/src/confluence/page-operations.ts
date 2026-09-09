// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Business logic for Confluence pages.
 *
 * Sits between the tool handlers and {@link ConfluenceConnector}, and owns
 * the two concerns no single REST call covers:
 *
 *  - **Markdown boundary.** Callers speak markdown; the API speaks ADF. Every
 *    conversion happens here so handlers never touch ADF.
 *  - **Read before write.** A Confluence update must carry the full body,
 *    title and the next version number, so a partial edit is only expressible
 *    as read-modify-write. Doing it here keeps every handler from
 *    reimplementing it, and reimplementing it slightly differently.
 *
 * @module
 */

import {
  adfToMarkdown,
  markdownToAdf,
  MarkupLossError,
} from '@softspark/atlassian-mcp-core';
import type { AdfDocument, BodyFormat } from '@softspark/atlassian-mcp-core';
import type { ConfluenceConnector } from './connector.js';
import { hasStorageOnlyMarkup } from './connector.js';
import type {
  ConfluenceAttachment,
  ConfluenceBlogPost,
  ConfluenceBlogPostDetail,
  ConfluenceComment,
  ConfluenceInlineComment,
  ConfluenceLabel,
  ConfluencePage,
  ConfluencePageDetail,
  ConfluenceRestrictions,
  ConfluenceSearchHit,
  ConfluenceSpace,
  ConfluenceWhiteboard,
  PageWriteResult,
} from './types.js';

export class PageOperations {
  private readonly connector: ConfluenceConnector;

  /**
   * The body format configured for the space these operations act on.
   *
   * `storage` means the space's pages are Confluence XHTML and must stay that
   * way: reads default to storage, and a markdown write is refused rather than
   * quietly flattening macros, page links and attachments. `markdown` is the
   * default and keeps the ADF path.
   */
  private readonly format: BodyFormat;

  constructor(connector: ConfluenceConnector, format: BodyFormat = 'markdown') {
    this.connector = connector;
    this.format = format;
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /** List spaces visible to the account. */
  async listSpaces(limit?: number): Promise<readonly ConfluenceSpace[]> {
    return this.connector.listSpaces(limit);
  }

  /** Full-text CQL search. */
  async search(
    cql: string,
    limit?: number,
  ): Promise<readonly ConfluenceSearchHit[]> {
    return this.connector.searchPages(cql, limit);
  }

  /**
   * Search restricted to one space.
   *
   * The space filter is prepended rather than left to the caller so a
   * malformed user query cannot quietly widen the search across every space
   * on the site.
   */
  async searchInSpace(
    spaceKey: string,
    cql: string,
    limit?: number,
  ): Promise<readonly ConfluenceSearchHit[]> {
    const scoped =
      cql.trim().length > 0
        ? `space = "${spaceKey}" AND (${cql})`
        : `space = "${spaceKey}"`;
    return this.connector.searchPages(scoped, limit);
  }

  /**
   * Fetch a page with its body, plus its labels.
   *
   * Markdown by default. `storage` returns Confluence's own XHTML instead,
   * which is what an editor needs when the page carries macros: markdown
   * cannot represent them, and only the storage body can be safely written
   * back. `has_storage_markup` reports whether that is the case, so a caller
   * can tell before it tries to edit.
   */
  async getPageDetail(
    pageId: string,
    requestedFormat?: BodyFormat,
  ): Promise<ConfluencePageDetail> {
    const bodyFormat = requestedFormat ?? this.format;
    const [current, labels] = await Promise.all([
      this.connector.getPage(pageId, 'storage'),
      this.connector.getLabels(pageId),
    ]);

    const { page, storage, authorId, createdAt } = current;
    const hasMarkup = hasStorageOnlyMarkup(storage);

    // Markdown needs the ADF representation, which is a second read. Only pay
    // for it when the caller actually asked for markdown.
    const body =
      bodyFormat === 'storage'
        ? (storage ?? '')
        : adfToMarkdown((await this.connector.getPage(pageId)).adf);

    return {
      ...page,
      body,
      bodyFormat,
      hasStorageMarkup: hasMarkup,
      labels,
      ...(authorId !== undefined ? { authorId } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
    };
  }

  /** Direct children of a page. */
  async getChildren(
    pageId: string,
    limit?: number,
  ): Promise<readonly ConfluencePage[]> {
    return this.connector.getChildPages(pageId, limit);
  }

  /** Top-level listing of the pages in a space. */
  async listSpacePages(
    spaceKey: string,
    limit?: number,
  ): Promise<readonly ConfluencePage[]> {
    const spaceId = await this.connector.resolveSpaceId(spaceKey);
    return this.connector.getSpacePages(spaceId, limit);
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /** Create a page from markdown or from a raw storage body. */
  async createPage(input: {
    readonly spaceKey: string;
    readonly title: string;
    readonly markdown?: string;
    readonly storage?: string;
    readonly parentId?: string;
    readonly draft?: boolean;
    readonly allowMarkupLoss?: boolean;
  }): Promise<PageWriteResult> {
    if (input.markdown === undefined && input.storage === undefined) {
      throw new Error('A new page needs a body: provide content or storage.');
    }
    this.assertCreateAllowed(input);

    const spaceId = await this.connector.resolveSpaceId(input.spaceKey);

    return this.connector.createPage({
      spaceId,
      title: input.title,
      ...(input.storage !== undefined
        ? { storage: input.storage }
        : { adf: markdownToAdf(input.markdown ?? '') }),
      status: input.draft === true ? 'draft' : 'current',
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    });
  }

  /**
   * Update a page's title, body, or both.
   *
   * The page is read in storage format first, for two reasons.
   *
   * **A body the caller did not touch is written back byte for byte.** A
   * title-only rename or a re-parent used to round-trip the body through
   * markdown, which quietly rewrote it. Now it does not touch the body at all.
   *
   * **A markdown body is refused when it would destroy markup.** Confluence
   * stores macros (info panels, tables of contents, code blocks with a
   * language), links to other pages, and attachment and image references as
   * storage markup with no markdown equivalent. Converting such a page to
   * markdown and back keeps the visible prose and silently drops all of it.
   * Rather than do that, this throws and names what is at stake. Callers who
   * genuinely mean to replace the page wholesale pass `allowMarkupLoss`;
   * callers editing a macro-bearing page should send `storage` instead.
   */
  async updatePage(input: {
    readonly pageId: string;
    readonly title?: string;
    readonly markdown?: string;
    readonly storage?: string;
    readonly parentId?: string;
    readonly versionMessage?: string;
    readonly allowMarkupLoss?: boolean;
  }): Promise<PageWriteResult> {
    const current = await this.connector.getPage(input.pageId, 'storage');

    const body = this.resolveUpdateBody(input, current.storage);

    return this.connector.updatePage({
      pageId: input.pageId,
      title: input.title ?? current.page.title,
      ...body,
      version: current.page.version,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.versionMessage !== undefined
        ? { versionMessage: input.versionMessage }
        : {}),
    });
  }

  /**
   * Decide which body a page update should write.
   *
   * Explicit storage wins, then markdown (guarded), then the untouched
   * current body.
   */
  private resolveUpdateBody(
    input: {
      readonly markdown?: string;
      readonly storage?: string;
      readonly allowMarkupLoss?: boolean;
    },
    currentStorage: string | null,
  ): { readonly storage: string } | { readonly adf: AdfDocument } {
    if (input.storage !== undefined) {
      return { storage: input.storage };
    }

    if (input.markdown !== undefined) {
      if (input.allowMarkupLoss !== true) {
        this.assertMarkdownAllowed(currentStorage);
      }
      return { adf: markdownToAdf(input.markdown) };
    }

    // Nothing to change: write the existing body straight back, unconverted.
    if (currentStorage !== null) {
      return { storage: currentStorage };
    }
    return { adf: markdownToAdf('') };
  }

  /**
   * Refuse a markdown body that would lose content.
   *
   * Two independent reasons, reported separately because the fix differs. The
   * space setting is a standing decision about how a space is authored; the
   * per-page check catches storage markup in a space nobody has configured yet.
   */
  private assertMarkdownAllowed(currentStorage: string | null): void {
    if (this.format === 'storage') {
      throw new MarkupLossError(
        'This space is configured with format=storage, so its pages are Confluence XHTML and are written as XHTML. ' +
          'Send the body as `storage`. ' +
          'To change how the whole space is authored, run: confluence-mcp space set-format <SPACE_KEY> markdown. ' +
          'To override for this one call, pass allow_markup_loss=true.',
      );
    }

    if (hasStorageOnlyMarkup(currentStorage)) {
      throw new MarkupLossError(
        'This page uses Confluence storage markup (macros such as info/note panels or a table of contents, links to other pages, or attachment and image references). ' +
          'Replacing its body with markdown would keep the text and silently delete all of that. ' +
          'Send the edited page as `storage` to preserve it, or pass allow_markup_loss=true if you really mean to replace the page with plain content.',
      );
    }
  }

  /**
   * Refuse creating a markdown page in a storage-format space.
   *
   * A new page has nothing to lose, but mixing representations inside one
   * space is how a space stops being editable by the tooling that owns it.
   */
  private assertCreateAllowed(input: {
    readonly markdown?: string;
    readonly storage?: string;
    readonly allowMarkupLoss?: boolean;
  }): void {
    if (
      this.format === 'storage' &&
      input.storage === undefined &&
      input.allowMarkupLoss !== true
    ) {
      throw new MarkupLossError(
        'This space is configured with format=storage, so new pages are authored as Confluence XHTML. ' +
          'Pass `storage` instead of `content`, or allow_markup_loss=true to create a markdown page here anyway.',
      );
    }
  }

  /**
   * Re-parent a page.
   *
   * Two different endpoints, chosen by what the move actually is. Within a
   * space, the v2 update carries the page's own fields and is the cheaper,
   * better-documented route. Across spaces, v2 refuses (`spaceId` is not
   * updatable), so the move goes through the v1 content-tree endpoint, where
   * the space follows the new parent.
   *
   * `position` other than `append` also forces the v1 route, because v2 can
   * only express "make this a child of X", not sibling ordering.
   */
  async movePage(input: {
    readonly pageId: string;
    readonly parentId: string;
    readonly position?: 'append' | 'before' | 'after';
    readonly crossSpace?: boolean;
  }): Promise<PageWriteResult> {
    const position = input.position ?? 'append';

    if (input.crossSpace === true || position !== 'append') {
      await this.connector.movePageToTarget(
        input.pageId,
        position,
        input.parentId,
      );
      // v1 returns only an id, so read the page back for the caller's report.
      const moved = await this.connector.getPage(input.pageId);
      return {
        id: moved.page.id,
        title: moved.page.title,
        version: moved.page.version,
        ...(moved.page.url !== undefined ? { url: moved.page.url } : {}),
      };
    }

    // Storage, not ADF: a move must not rewrite the body it carries past.
    const current = await this.connector.getPage(input.pageId, 'storage');

    return this.connector.movePage({
      pageId: input.pageId,
      title: current.page.title,
      ...(current.storage !== null
        ? { storage: current.storage }
        : { adf: markdownToAdf('') }),
      version: current.page.version,
      parentId: input.parentId,
    });
  }

  /**
   * Move a page to the trash.
   *
   * Returns the title so the caller can report what was removed; after the
   * call the page can no longer be read back to find out.
   */
  async deletePage(pageId: string): Promise<{ readonly title: string }> {
    const { page } = await this.connector.getPage(pageId);
    await this.connector.deletePage(pageId);
    return { title: page.title };
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  /** Read footer comments with bodies rendered as markdown. */
  async getComments(
    pageId: string,
    limit?: number,
  ): Promise<readonly ConfluenceComment[]> {
    const raw = await this.connector.getFooterComments(pageId, limit);
    return raw.map(({ comment, adf }) => ({
      ...comment,
      body: adfToMarkdown(adf),
    }));
  }

  /** Add a footer comment written in markdown. */
  async addComment(input: {
    readonly pageId: string;
    readonly markdown: string;
    readonly parentCommentId?: string;
  }): Promise<ConfluenceComment> {
    return this.connector.addFooterComment({
      pageId: input.pageId,
      adf: markdownToAdf(input.markdown),
      ...(input.parentCommentId !== undefined
        ? { parentCommentId: input.parentCommentId }
        : {}),
    });
  }

  /** Delete a footer comment. */
  async deleteComment(commentId: string): Promise<void> {
    await this.connector.deleteFooterComment(commentId);
  }

  // -----------------------------------------------------------------------
  // Inline comments
  // -----------------------------------------------------------------------

  /** Read inline (anchored) comments with bodies rendered as markdown. */
  async getInlineComments(
    pageId: string,
    limit?: number,
  ): Promise<readonly ConfluenceInlineComment[]> {
    const raw = await this.connector.getInlineComments(pageId, limit);
    return raw.map(({ comment, adf }) => ({
      ...comment,
      body: adfToMarkdown(adf),
    }));
  }

  /**
   * Add an inline comment anchored to a passage of the page.
   *
   * When `matchCount` is not given, the passage is counted in the page's own
   * markdown so Confluence anchors to the intended occurrence. Getting that
   * count wrong silently attaches the comment to a different passage, which
   * is worse than failing.
   */
  async addInlineComment(input: {
    readonly pageId: string;
    readonly markdown: string;
    readonly textSelection?: string;
    readonly matchIndex?: number;
    readonly matchCount?: number;
    readonly parentCommentId?: string;
  }): Promise<ConfluenceInlineComment> {
    const isReply = input.parentCommentId !== undefined;

    if (!isReply && (input.textSelection ?? '').length === 0) {
      throw new Error(
        'A top-level inline comment must name the text_selection it anchors to. Use add_page_comment for a comment on the page as a whole.',
      );
    }

    let matchCount = input.matchCount;
    if (!isReply && matchCount === undefined && input.textSelection) {
      matchCount = await this.countOccurrences(
        input.pageId,
        input.textSelection,
      );
      if (matchCount === 0) {
        throw new Error(
          `The text "${input.textSelection}" does not appear in page ${input.pageId}. An inline comment must anchor to text that exists.`,
        );
      }
    }

    const comment = await this.connector.addInlineComment({
      pageId: input.pageId,
      adf: markdownToAdf(input.markdown),
      ...(input.textSelection !== undefined
        ? { textSelection: input.textSelection }
        : {}),
      ...(input.matchIndex !== undefined ? { matchIndex: input.matchIndex } : {}),
      ...(matchCount !== undefined ? { matchCount } : {}),
      ...(input.parentCommentId !== undefined
        ? { parentCommentId: input.parentCommentId }
        : {}),
    });

    return { ...comment, body: input.markdown };
  }

  /** Count how many times a passage occurs in a page's rendered markdown. */
  private async countOccurrences(
    pageId: string,
    needle: string,
  ): Promise<number> {
    const { adf } = await this.connector.getPage(pageId);
    const text = adfToMarkdown(adf);
    if (needle.length === 0) {
      return 0;
    }

    let count = 0;
    let index = text.indexOf(needle);
    while (index !== -1) {
      count += 1;
      index = text.indexOf(needle, index + needle.length);
    }
    return count;
  }

  // -----------------------------------------------------------------------
  // Restrictions
  // -----------------------------------------------------------------------

  /** Read who may view and edit a page. */
  async getRestrictions(pageId: string): Promise<ConfluenceRestrictions> {
    return this.connector.getRestrictions(pageId);
  }

  /** Replace the read and update restrictions on a page. */
  async setRestrictions(
    pageId: string,
    input: {
      readonly readAccountIds: readonly string[];
      readonly readGroupIds: readonly string[];
      readonly updateAccountIds: readonly string[];
      readonly updateGroupIds: readonly string[];
    },
  ): Promise<ConfluenceRestrictions> {
    return this.connector.setRestrictions(pageId, input);
  }

  // -----------------------------------------------------------------------
  // Blog posts
  // -----------------------------------------------------------------------

  /** List blog posts in a space. */
  async listBlogPosts(
    spaceKey: string,
    limit?: number,
  ): Promise<readonly ConfluenceBlogPost[]> {
    const spaceId = await this.connector.resolveSpaceId(spaceKey);
    return this.connector.getSpaceBlogPosts(spaceId, limit);
  }

  /** Read a blog post with its body as markdown and its labels. */
  async getBlogPostDetail(
    blogPostId: string,
  ): Promise<ConfluenceBlogPostDetail> {
    const [{ post, adf }, labels] = await Promise.all([
      this.connector.getBlogPost(blogPostId),
      this.connector.getLabels(blogPostId),
    ]);

    return { ...post, body: adfToMarkdown(adf), labels };
  }

  /** Create a blog post from markdown. */
  async createBlogPost(input: {
    readonly spaceKey: string;
    readonly title: string;
    readonly markdown: string;
    readonly draft?: boolean;
  }): Promise<PageWriteResult> {
    const spaceId = await this.connector.resolveSpaceId(input.spaceKey);

    return this.connector.createBlogPost({
      spaceId,
      title: input.title,
      adf: markdownToAdf(input.markdown),
      status: input.draft === true ? 'draft' : 'current',
    });
  }

  /** Update a blog post, keeping whatever the caller did not supply. */
  async updateBlogPost(input: {
    readonly blogPostId: string;
    readonly title?: string;
    readonly markdown?: string;
    readonly versionMessage?: string;
  }): Promise<PageWriteResult> {
    const current = await this.connector.getBlogPost(input.blogPostId);

    const adf =
      input.markdown !== undefined
        ? markdownToAdf(input.markdown)
        : (current.adf ?? markdownToAdf(''));

    return this.connector.updateBlogPost({
      blogPostId: input.blogPostId,
      title: input.title ?? current.post.title,
      adf,
      version: current.post.version,
      ...(input.versionMessage !== undefined
        ? { versionMessage: input.versionMessage }
        : {}),
    });
  }

  /** Move a blog post to the trash, reporting the title it removed. */
  async deleteBlogPost(
    blogPostId: string,
  ): Promise<{ readonly title: string }> {
    const { post } = await this.connector.getBlogPost(blogPostId);
    await this.connector.deleteBlogPost(blogPostId);
    return { title: post.title };
  }

  // -----------------------------------------------------------------------
  // Whiteboards
  // -----------------------------------------------------------------------

  /** Read whiteboard metadata. */
  async getWhiteboard(whiteboardId: string): Promise<ConfluenceWhiteboard> {
    return this.connector.getWhiteboard(whiteboardId);
  }

  /** Create an empty whiteboard. */
  async createWhiteboard(input: {
    readonly spaceKey: string;
    readonly title?: string;
    readonly parentId?: string;
  }): Promise<ConfluenceWhiteboard> {
    const spaceId = await this.connector.resolveSpaceId(input.spaceKey);

    return this.connector.createWhiteboard({
      spaceId,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    });
  }

  /** Move a whiteboard to the trash, reporting the title it removed. */
  async deleteWhiteboard(
    whiteboardId: string,
  ): Promise<{ readonly title: string }> {
    const board = await this.connector.getWhiteboard(whiteboardId);
    await this.connector.deleteWhiteboard(whiteboardId);
    return { title: board.title };
  }

  // -----------------------------------------------------------------------
  // Labels and attachments
  // -----------------------------------------------------------------------

  /** Read the labels on a page. */
  async getLabels(pageId: string): Promise<readonly ConfluenceLabel[]> {
    return this.connector.getLabels(pageId);
  }

  /** Add labels to a page. */
  async addLabels(
    pageId: string,
    labels: readonly string[],
  ): Promise<readonly ConfluenceLabel[]> {
    return this.connector.addLabels(pageId, labels);
  }

  /** Remove one label from a page. */
  async removeLabel(pageId: string, name: string): Promise<void> {
    await this.connector.removeLabel(pageId, name);
  }

  /** List attachment metadata for a page. */
  async listAttachments(
    pageId: string,
    limit?: number,
  ): Promise<readonly ConfluenceAttachment[]> {
    return this.connector.listAttachments(pageId, limit);
  }

  /** Upload a file as a page attachment. */
  async uploadAttachment(input: {
    readonly pageId: string;
    readonly filename: string;
    readonly content: Uint8Array<ArrayBuffer>;
    readonly mediaType?: string;
    readonly comment?: string;
  }): Promise<ConfluenceAttachment> {
    return this.connector.uploadAttachment(input);
  }
}
