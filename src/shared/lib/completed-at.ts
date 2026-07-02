// =============================================================================
// STABLE completedAt
//
// `completedAt` records the first time an academic unit (subject, level, course)
// reached its CURRENT completion state. It must be stable across recalculations:
// re-running the cascade on an already-completed unit must never move the date
// forward. This is the pure decision that every progress writer uses so the rule
// can never diverge between subject, level and course.
//
// It generalises the stability logic already used by the CourseCompletionEngine
// (`persistCourseCompletion`: completed ? existing ?? now : null).
//
// Two status sets are required — a single "terminal" set is provably
// insufficient, because two symmetric terminal↔terminal transitions demand
// opposite outcomes (FAILED → PASSED stamps a new date, PASSED → FAILED clears
// it). We therefore distinguish:
//
//   * terminalStatuses   — statuses that carry a completedAt at all.
//   * completionStatuses  — the subset that means POSITIVE completion
//                           (e.g. PASSED / PROMOTED / COMPLETED). FAILED is
//                           terminal but NOT a positive completion.
// =============================================================================

export interface ResolveStableCompletedAtInput {
  /** Status stored before this recalculation (null when the row is new). */
  previousStatus: string | null;
  /** completedAt stored before this recalculation. */
  previousCompletedAt: Date | null;
  /** Status this recalculation is about to persist. */
  nextStatus: string;
  /** Statuses that carry a completedAt (e.g. subject: PASSED, FAILED). */
  terminalStatuses: ReadonlySet<string>;
  /** Terminal statuses that mean positive completion (e.g. PASSED). */
  completionStatuses: ReadonlySet<string>;
  /** Timestamp to stamp when a fresh completion is reached. */
  now: Date;
}

/**
 * Resolve the stable completedAt for a progress row.
 *
 *  - next non-terminal                    → null           (not completed / left completion)
 *  - status unchanged (terminal)          → preserve        (idempotent recalculation)
 *  - entered a positive completion status → now             (e.g. IN_PROGRESS/FAILED → PASSED)
 *  - reached a terminal non-completion status (e.g. FAILED):
 *      · as a regression from a positive completion (PASSED → FAILED) → null
 *      · freshly (IN_PROGRESS → FAILED)                              → now
 */
export function resolveStableCompletedAt(input: ResolveStableCompletedAtInput): Date | null {
  const {
    previousStatus,
    previousCompletedAt,
    nextStatus,
    terminalStatuses,
    completionStatuses,
    now,
  } = input;

  // Not (or no longer) in a terminal status → nothing is completed.
  if (!terminalStatuses.has(nextStatus)) return null;

  // Status unchanged → keep the original timestamp (stamp now if it was missing).
  if (previousStatus === nextStatus) return previousCompletedAt ?? now;

  // Freshly reached a positive completion (PASSED / PROMOTED / COMPLETED).
  if (completionStatuses.has(nextStatus)) return now;

  // Reached a terminal non-completion status (e.g. FAILED):
  //  - if we regressed from a positive completion, the unit is no longer
  //    completed → clear the date;
  //  - otherwise this is a fresh terminal outcome → stamp now.
  if (previousStatus != null && completionStatuses.has(previousStatus)) return null;
  return now;
}
