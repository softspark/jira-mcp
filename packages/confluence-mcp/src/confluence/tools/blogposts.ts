// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Lukasz Krzemien (biuro@softspark.eu)
// Source: https://github.com/softspark/jira-mcp

/**
 * Tool handlers for blog posts.
 *
 * Blog posts are kept apart from pages rather than folded in behind a
 * `content_type` flag: they have no parent, no tree position and cannot be
 * moved, so half the page parameters would be meaningless on them.
 *
 * @module
 */

import { assertDeletionApproved } from '@softspark/atlassian-mcp-core';
import type { ConfluenceDeps, ToolResult } from './helpers.js';
import {
  failure,
  getPageOperations,
  languageForSpace,
  success,
} from './helpers.js';

// ---------------------------------------------------------------------------
// list_blog_posts
// ---------------------------------------------------------------------------

export interface ListBlogPostsArgs {
  readonly space_key?: string;
  readonly limit?: number;
}

/** List blog posts in a space. */
export async function handleListBlogPosts(
  args: ListBlogPostsArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const posts = await ops.listBlogPosts(spaceKey, args.limit);

    return success({
      space_key: spaceKey,
      blog_posts: posts,
      message: `Found ${String(posts.length)} blog post(s) in ${spaceKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// get_blog_post
// ---------------------------------------------------------------------------

export interface GetBlogPostArgs {
  readonly blog_post_id: string;
  readonly space_key?: string;
}

/** Read a blog post with its body as markdown. */
export async function handleGetBlogPost(
  args: GetBlogPostArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const post = await ops.getBlogPostDetail(args.blog_post_id);

    return success({
      blog_post: post,
      language: languageForSpace(deps.config, spaceKey),
      message: `Retrieved blog post ${args.blog_post_id} (version ${String(post.version)})`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// create_blog_post
// ---------------------------------------------------------------------------

export interface CreateBlogPostArgs {
  readonly title: string;
  readonly content: string;
  readonly space_key?: string;
  readonly draft?: boolean;
}

/** Create a blog post from markdown. */
export async function handleCreateBlogPost(
  args: CreateBlogPostArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    const [spaceKey, ops] = getPageOperations(deps, args.space_key);
    const result = await ops.createBlogPost({
      spaceKey,
      title: args.title,
      markdown: args.content,
      ...(args.draft !== undefined ? { draft: args.draft } : {}),
    });

    return success({
      blog_post: result,
      space_key: spaceKey,
      message: `Created blog post '${result.title}' in ${spaceKey}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// update_blog_post
// ---------------------------------------------------------------------------

export interface UpdateBlogPostArgs {
  readonly blog_post_id: string;
  readonly title?: string;
  readonly content?: string;
  readonly version_message?: string;
  readonly space_key?: string;
}

/** Update a blog post title, body or both. */
export async function handleUpdateBlogPost(
  args: UpdateBlogPostArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    if (args.title === undefined && args.content === undefined) {
      throw new Error(
        'Nothing to update: provide at least one of title or content.',
      );
    }

    const [, ops] = getPageOperations(deps, args.space_key);
    const result = await ops.updateBlogPost({
      blogPostId: args.blog_post_id,
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.content !== undefined ? { markdown: args.content } : {}),
      ...(args.version_message !== undefined
        ? { versionMessage: args.version_message }
        : {}),
    });

    return success({
      blog_post: result,
      message: `Updated blog post ${result.id} to version ${String(result.version)}`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// delete_blog_post
// ---------------------------------------------------------------------------

export interface DeleteBlogPostArgs {
  readonly blog_post_id: string;
  readonly space_key?: string;
  readonly user_approved?: boolean;
}

/** Move a blog post to the trash. Requires `user_approved: true`. */
export async function handleDeleteBlogPost(
  args: DeleteBlogPostArgs,
  deps: ConfluenceDeps,
): Promise<ToolResult> {
  try {
    assertDeletionApproved(args.user_approved);

    const [, ops] = getPageOperations(deps, args.space_key);
    const { title } = await ops.deleteBlogPost(args.blog_post_id);

    return success({
      blog_post_id: args.blog_post_id,
      title,
      message: `Moved blog post '${title}' (${args.blog_post_id}) to trash`,
    });
  } catch (error: unknown) {
    return failure(error);
  }
}
