/**
 * Prevents a form session from submitting a second command while its first
 * command is either in flight or committed but not yet projected.
 */
export function isWriteSubmissionLocked(
  saving: boolean,
  committedPending: boolean,
): boolean {
  return saving || committedPending;
}
