/**
 * Approval guard for destructive delete tools.
 *
 * The caller must explicitly provide `user_approved: true` before the server
 * will delete a Jira task or comment.
 */

import { DeletionApprovalRequiredError } from '../errors/index.js';

export function assertDeletionApproved(
  userApproved: boolean | undefined,
): void {
  if (userApproved === true) {
    return;
  }

  throw new DeletionApprovalRequiredError(
    'Delete operation requires explicit user approval. Re-run the tool with user_approved=true only after the user confirms the deletion.',
  );
}
