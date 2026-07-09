// =============================================================================
// CERTIFICATE OUTBOX — RETRY POLICY (Phase 14) — PURE
// -----------------------------------------------------------------------------
// The retry maths for the in-process Outbox. Pure functions only: they compute
// whether another delivery attempt is allowed and WHEN it would next be due
// (exponential backoff). They schedule NOTHING — no timers, no wall-clock reads —
// the caller passes `now`. Distributed scheduling / real timers are out of scope
// (a future phase), so `nextRetryAt` is advisory metadata, not an enforced gate.
// =============================================================================

/** Maximum number of failed attempts before an entry is dead-lettered (§2). Once
 *  `retryCount` reaches this value the entry can no longer be retried. */
export const OUTBOX_MAX_RETRIES = 3;

/** Base backoff (ms) for the exponential delay: `base * 2^(retryCount - 1)`. */
export const OUTBOX_BASE_DELAY_MS = 1000;

/** Whether an entry with `retryCount` failures may be attempted again. False once
 *  the retry budget is exhausted (→ dead letter). Pure. */
export function canRetry(retryCount: number): boolean {
  return retryCount < OUTBOX_MAX_RETRIES;
}

/** The exponential backoff delay (ms) BEFORE the attempt numbered `retryCount`
 *  (1-based: the delay after the 1st failure is `base`, after the 2nd `base*2`,
 *  after the 3rd `base*4`). Clamped to ≥ 0. Pure. */
export function retryDelayMs(retryCount: number): number {
  if (retryCount <= 0) return 0;
  return OUTBOX_BASE_DELAY_MS * 2 ** (retryCount - 1);
}

/** When the next attempt would be due, given `now` and the current `retryCount`.
 *  Advisory only (no scheduler enforces it in Phase 14). Pure. */
export function nextRetryAt(now: Date, retryCount: number): Date {
  return new Date(now.getTime() + retryDelayMs(retryCount));
}
