/**
 * REPEAT-CLIENT SIGNAL, censored honestly.
 *
 * A window still open is an UNKNOWN, not a failure. Without the tri-state,
 * every recent workflow would show a repeat rate near zero by pure
 * construction — the newest tasks cannot possibly have repeated yet, and
 * counting their silence as "no" is the exact censoring bias this module
 * exists to prevent. The denominator of any repeat rate is the tasks whose
 * answer is RESOLVED (true or false), never the open windows.
 *
 * This is revealed preference, not satisfaction. Nothing here may ever be
 * labeled "satisfaction", and Submission.rating (the operator's grade of
 * the WORKER) stays entirely out of this file — both pinned by tests.
 */

export const REPEAT_WINDOW_DAYS = 90;

export function repeatWindowEndsAt(acceptedAt: Date): Date {
  return new Date(acceptedAt.getTime() + REPEAT_WINDOW_DAYS * 24 * 3600 * 1000);
}

/**
 *  true  — the same client accepted another task inside (acceptedAt, end]
 *  null  — window still open and no repeat yet: CENSORED
 *  false — window closed with no repeat
 */
export function resolveRepeatStatus(input: {
  acceptedAt: Date;
  windowEndsAt: Date;
  nextAcceptedAt: Date | null;
  now: Date;
}): boolean | null {
  if (
    input.nextAcceptedAt !== null &&
    input.nextAcceptedAt.getTime() > input.acceptedAt.getTime() &&
    input.nextAcceptedAt.getTime() <= input.windowEndsAt.getTime()
  ) {
    return true;
  }
  if (input.now.getTime() < input.windowEndsAt.getTime()) return null;
  return false;
}
