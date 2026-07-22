import { recalculateStudentRiskProjectionsBatch } from "@/modules/students/services/student-risk-projection.service";

// =============================================================================
// STUDENT RISK RECOMPUTE SCHEDULER (F-M4)
//
// An in-process coalescing buffer between risk-relevant domain events and the actual
// recompute. Instead of the handler recomputing synchronously per event — which, on a
// bulk attendance / session operation, fans out to hundreds of recomputes (and recomputes
// the SAME student several times when they appear in several events) — events are
// SCHEDULED here, coalesced by (organizationId, studentId), and flushed once per short
// window through the bounded-concurrency batch API.
//
// Correctness never depends on the dedupe: the recompute is idempotent and the periodic
// reconcile (F-H3) is the backstop. This is purely a cost/latency optimization. It is also
// in-process only — across instances each instance coalesces its own burst; that is fine
// because the work is idempotent. A flush lost to a suspended serverless process is healed
// by the reconcile. It never changes the risk rules, the projection, coverage, event
// semantics or the post-commit guarantee.
// =============================================================================

const WINDOW_MS_DEFAULT = 100;
const WINDOW_MS_MIN = 10;
const WINDOW_MS_MAX = 1000;

function resolveWindowMs(): number {
  const raw = Number(process.env.STUDENT_RISK_RECOMPUTE_WINDOW_MS);
  if (!Number.isFinite(raw) || raw <= 0) return WINDOW_MS_DEFAULT;
  return Math.max(WINDOW_MS_MIN, Math.min(WINDOW_MS_MAX, Math.floor(raw)));
}

interface PendingRecompute {
  organizationId: string;
  studentId: string;
}

// Keyed "organizationId:studentId" → coalesced request (duplicates collapse to one).
const pending = new Map<string, PendingRecompute>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function key(organizationId: string, studentId: string): string {
  return `${organizationId}:${studentId}`;
}

/**
 * Coalesce a recompute for (organizationId, studentId). The first call in a window arms a
 * short timer; subsequent calls for the same student within the window are folded into the
 * one pending entry. Never throws — scheduling is best-effort.
 */
export function scheduleStudentRiskRecompute(params: { organizationId: string; studentId: string }): void {
  if (!params.organizationId || !params.studentId) return;
  pending.set(key(params.organizationId, params.studentId), {
    organizationId: params.organizationId,
    studentId: params.studentId,
  });
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flushStudentRiskRecomputeScheduler();
    }, resolveWindowMs());
    // Never keep the process alive just for a best-effort flush.
    flushTimer.unref?.();
  }
}

/**
 * Drain the coalesced buffer and recompute the unique students, grouped by org, through the
 * bounded-concurrency batch. Safe to call directly (tests / explicit flush). Overlap-guarded.
 */
export async function flushStudentRiskRecomputeScheduler(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (flushing || pending.size === 0) return;
  flushing = true;
  try {
    const items = [...pending.values()];
    pending.clear();

    const byOrg = new Map<string, string[]>();
    for (const it of items) {
      const list = byOrg.get(it.organizationId);
      if (list) list.push(it.studentId);
      else byOrg.set(it.organizationId, [it.studentId]);
    }

    for (const [organizationId, studentIds] of byOrg) {
      try {
        await recalculateStudentRiskProjectionsBatch({ organizationId, studentIds });
      } catch (error) {
        // Best-effort — the reconcile sweep heals anything a failed flush left stale.
        console.error(`[risk-recompute-scheduler] batch flush failed for org ${organizationId}:`, error);
      }
    }
  } finally {
    flushing = false;
    // Anything scheduled during the flush gets its own window.
    if (pending.size > 0 && !flushTimer) {
      flushTimer = setTimeout(() => {
        void flushStudentRiskRecomputeScheduler();
      }, resolveWindowMs());
      flushTimer.unref?.();
    }
  }
}

/** Test-only: clear the buffer + timer so scheduler state never leaks across tests. */
export function __resetStudentRiskRecomputeSchedulerForTests(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pending.clear();
  flushing = false;
}
