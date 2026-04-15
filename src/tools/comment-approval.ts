/**
 * Approval guard for comment-writing tools.
 *
 * The caller must explicitly provide `user_approved: true` before the server
 * will send a Jira comment mutation. This is intended for hook-mediated
 * confirmation flows.
 */

import { CommentApprovalRequiredError } from '../errors/index.js';

export function assertCommentApproved(
  userApproved: boolean | undefined,
): void {
  if (userApproved === true) {
    return;
  }

  throw new CommentApprovalRequiredError(
    'Comment write requires explicit user approval. Re-run the tool with user_approved=true only after the user accepts the comment content.',
  );
}
