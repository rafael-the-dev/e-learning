import type { ServiceContext } from "@/shared/types/common";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { findCompletedSessionsForLevelSubject } from "@/modules/attendance/repositories/attendance-session.repository";
import {
  findEnrollmentContext,
  findCalcRecordsForEnrollment,
  findEnrollmentsMarkedInSession,
  findSummaryByEnrollmentAndSubject,
  upsertSummary,
} from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import { loadEffectiveAttendancePolicy } from "@/modules/attendance/services/attendance-policy.resolver";
import { calculateAttendanceSummary } from "@/modules/attendance/services/attendance-calculation.engine";
import { applyAttendanceAcademicImpact } from "@/modules/attendance/services/attendance-academic-wiring.service";
import type { AttendanceSummaryRecalcResult } from "@/modules/attendance/types";

// =============================================================================
// STUDENT SUBJECT ATTENDANCE SUMMARY SERVICE — Attendance Engine Phase 3
//
// THE SINGLE WRITER of StudentSubjectAttendanceSummary. Recalculates the
// persisted per-enrolment+subject read-model deterministically and idempotently.
//
// Behaviour-neutral: it writes ONLY the summary row. It does NOT touch
// StudentSubjectProgress.attendancePercentage, the grade/level/course cascade, or
// INCOMPLETE. The legacy on-read calculator is left in place and still coexists.
//
// Transaction shape (mirrors the Grade Engine): read → upsert summary → audit
// inside ONE transaction; domain events are collected and published only AFTER
// the transaction commits — never before.
//
// Idempotency: reruns with identical inputs produce a byte-identical row (the
// write, audit, and events are all skipped when nothing meaningful changed).
// =============================================================================

export interface RecalcOptions {
  /** Publish domain events after commit. Default true. */
  emitEvents?: boolean;
  /** Phase 5: bridge the summary into the academic cascade when the effective
   *  policy enables enforcement. Default true. Set false to keep a pure
   *  behaviour-neutral summary recalc (Phase 3 semantics). */
  applyAcademicImpact?: boolean;
}

function metricsDiffer(
  prev: { attendancePercentage: number | null; status: string } | null,
  next: { attendancePercentage: number | null; status: string }
): boolean {
  if (!prev) return true;
  return prev.attendancePercentage !== next.attendancePercentage || prev.status !== next.status;
}

/**
 * Recalculate + persist the summary for one (enrollment, levelSubject).
 * Transactional and idempotent. Throws NotFoundError if the enrolment or
 * levelSubject is not in the caller's organization.
 */
export async function recalculateStudentSubjectAttendanceSummary(
  context: ServiceContext,
  input: { enrollmentId: string; levelSubjectId: string },
  options: RecalcOptions = {}
): Promise<AttendanceSummaryRecalcResult> {
  const { organizationId } = context;
  const { enrollmentId, levelSubjectId } = input;
  const emitEvents = options.emitEvents ?? true;
  const applyAcademicImpact = options.applyAcademicImpact ?? true;
  const db = await getDb();

  // ── Load inputs (read-only, pre-transaction) ────────────────────────────────
  const enrollment = await findEnrollmentContext(enrollmentId, organizationId);
  if (!enrollment) throw new NotFoundError("Matrícula", enrollmentId);

  const levelSubject = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId, deletedAt: null },
    select: { id: true, minimumAttendancePercentage: true, attendancePolicyId: true },
  });
  if (!levelSubject) throw new NotFoundError("Configuração de disciplina", levelSubjectId);

  const policy = await loadEffectiveAttendancePolicy(
    organizationId,
    levelSubject.attendancePolicyId,
    db
  );

  const sessions = enrollment.classGroupId
    ? await findCompletedSessionsForLevelSubject(enrollment.classGroupId, levelSubjectId, organizationId)
    : [];
  const records = await findCalcRecordsForEnrollment(
    enrollmentId,
    sessions.map((s) => s.id),
    organizationId
  );

  const minimum =
    levelSubject.minimumAttendancePercentage != null
      ? Number(levelSubject.minimumAttendancePercentage)
      : null;

  const computed = calculateAttendanceSummary({
    sessions,
    records,
    policy,
    minimumAttendancePercentage: minimum,
  });

  const next = { attendancePercentage: computed.attendancePercentage, status: computed.status };

  // ── Persist atomically (upsert + audit), collect events for post-commit ──────
  const events: DomainEvent[] = [];
  let changed = false;
  let previous: { attendancePercentage: number | null; status: string } | null = null;

  await db.$transaction(async (tx) => {
    const existing = await findSummaryByEnrollmentAndSubject(
      enrollmentId,
      levelSubjectId,
      organizationId,
      tx
    );
    previous = existing
      ? { attendancePercentage: existing.attendancePercentage, status: existing.status }
      : null;

    const anyFieldChanged =
      !existing ||
      existing.totalSessions !== computed.totalSessions ||
      existing.totalScheduledMinutes !== computed.totalScheduledMinutes ||
      existing.totalPresentMinutes !== computed.totalPresentMinutes ||
      existing.totalAbsentMinutes !== computed.totalAbsentMinutes ||
      existing.totalLateMinutes !== computed.totalLateMinutes ||
      existing.totalExcusedMinutes !== computed.totalExcusedMinutes ||
      existing.attendancePercentage !== computed.attendancePercentage ||
      existing.status !== computed.status ||
      existing.attendancePolicyId !== policy.policyId;

    // Idempotent: identical recompute → no write at all (calculatedAt stays put).
    if (!anyFieldChanged) return;

    const summary = await upsertSummary(
      {
        organizationId,
        enrollmentId,
        studentId: enrollment.studentId,
        levelSubjectId,
        attendancePolicyId: policy.policyId,
        totalSessions: computed.totalSessions,
        totalScheduledMinutes: computed.totalScheduledMinutes,
        totalPresentMinutes: computed.totalPresentMinutes,
        totalAbsentMinutes: computed.totalAbsentMinutes,
        totalLateMinutes: computed.totalLateMinutes,
        totalExcusedMinutes: computed.totalExcusedMinutes,
        attendancePercentage: computed.attendancePercentage,
        status: computed.status,
        calculatedAt: new Date(),
      },
      tx
    );

    // Audit + events only on a meaningful (percentage/status) change — avoids
    // spam when only an internal minute bucket shifted.
    if (metricsDiffer(previous, next)) {
      changed = true;
      await auditService.log(
        context,
        {
          entity: "StudentSubjectAttendanceSummary",
          entityId: summary.id,
          action: "attendance_summary.recalculated",
          oldValues: previous
            ? { attendancePercentage: previous.attendancePercentage, status: previous.status }
            : null,
          newValues: {
            enrollmentId,
            studentId: enrollment.studentId,
            levelSubjectId,
            attendancePercentage: next.attendancePercentage,
            status: next.status,
            calculatedAt: summary.calculatedAt,
          },
        },
        tx
      );

      const basePayload = {
        enrollmentId,
        studentId: enrollment.studentId,
        levelSubjectId,
        previousAttendancePercentage: previous?.attendancePercentage ?? null,
        newAttendancePercentage: next.attendancePercentage,
        previousStatus: previous?.status ?? null,
        newStatus: next.status,
        calculatedAt: summary.calculatedAt,
      };

      events.push({
        organizationId,
        eventType: DomainEventType.ATTENDANCE_SUMMARY_RECALCULATED,
        aggregateType: DomainAggregateType.ATTENDANCE,
        aggregateId: summary.id,
        payload: basePayload,
        actorId: context.userId,
      });

      // Transition events fire ONLY on an actual SUFFICIENT⇄BELOW_REQUIRED cross.
      if (previous && previous.status === "SUFFICIENT" && next.status === "BELOW_REQUIRED") {
        events.push({
          organizationId,
          eventType: DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED,
          aggregateType: DomainAggregateType.ATTENDANCE,
          aggregateId: summary.id,
          payload: basePayload,
          actorId: context.userId,
        });
      } else if (previous && previous.status === "BELOW_REQUIRED" && next.status === "SUFFICIENT") {
        events.push({
          organizationId,
          eventType: DomainEventType.ATTENDANCE_STUDENT_RECOVERED_ATTENDANCE,
          aggregateType: DomainAggregateType.ATTENDANCE,
          aggregateId: summary.id,
          payload: basePayload,
          actorId: context.userId,
        });
      }
    }
  });

  // ── Publish AFTER commit ─────────────────────────────────────────────────────
  if (emitEvents) {
    for (const event of events) await eventPublisher.publish(event);
  }

  // ── Phase 5 (GATED): bridge into the academic cascade ───────────────────────
  // Opt-in only: the default policy has enforceAttendanceForProgress = false, so
  // this is a no-op and the summary recalc stays behaviour-neutral. Runs only when
  // the summary actually changed. The wiring is transactional on its own; a
  // failure here never corrupts the (already-committed) summary — the repair
  // command (RecalculateAttendanceAcademicImpactCommand) is the recovery path.
  if (applyAcademicImpact && changed && policy.enforceAttendanceForProgress) {
    try {
      await applyAttendanceAcademicImpact(context, { enrollmentId, levelSubjectId });
    } catch (err) {
      console.error(
        `[attendance-academic] wiring failed for enrollment ${enrollmentId} / levelSubject ${levelSubjectId}`,
        err
      );
    }
  }

  return { enrollmentId, levelSubjectId, changed, previous, next };
}

/**
 * Recalculate every enrolment marked in a session (the fan-out for a session
 * complete/cancel). Best-effort per enrolment: one failure never aborts the rest.
 */
export async function recalculateSummariesForSession(
  context: ServiceContext,
  sessionId: string,
  options: RecalcOptions = {}
): Promise<AttendanceSummaryRecalcResult[]> {
  const db = await getDb();
  const session = await db.attendanceSession.findFirst({
    where: { id: sessionId, organizationId: context.organizationId, deletedAt: null },
    select: { levelSubjectId: true },
  });
  if (!session) return [];

  const enrollments = await findEnrollmentsMarkedInSession(sessionId, context.organizationId);
  const results: AttendanceSummaryRecalcResult[] = [];
  for (const e of enrollments) {
    try {
      results.push(
        await recalculateStudentSubjectAttendanceSummary(
          context,
          { enrollmentId: e.enrollmentId, levelSubjectId: session.levelSubjectId },
          options
        )
      );
    } catch (err) {
      console.error(
        `[attendance-summary] recalc failed for enrollment ${e.enrollmentId} / levelSubject ${session.levelSubjectId}`,
        err
      );
    }
  }
  return results;
}

// ─── Fire-and-forget triggers (behaviour-neutral: never roll back the mutation) ─

/**
 * Best-effort recalc of a single summary, appended AFTER an attendance mutation.
 * Deliberately non-blocking and error-swallowing — a summary failure must never
 * roll back or surface on the underlying mark/justification (behaviour-neutral).
 * The transactional command path exists for callers that need the result.
 */
export function triggerAttendanceSummaryRecalc(
  context: ServiceContext,
  input: { enrollmentId: string | null | undefined; levelSubjectId: string }
): void {
  if (!input.enrollmentId) return; // NULL enrollmentId — safely ignored (Phase 2)
  const enrollmentId = input.enrollmentId;
  void recalculateStudentSubjectAttendanceSummary(context, {
    enrollmentId,
    levelSubjectId: input.levelSubjectId,
  }).catch((err) =>
    console.error(
      `[attendance-summary] trigger recalc failed for enrollment ${enrollmentId}`,
      err
    )
  );
}

/** Best-effort session fan-out recalc, appended AFTER a session complete/cancel. */
export function triggerAttendanceSummaryRecalcForSession(
  context: ServiceContext,
  sessionId: string
): void {
  void recalculateSummariesForSession(context, sessionId).catch((err) =>
    console.error(`[attendance-summary] trigger session recalc failed for ${sessionId}`, err)
  );
}

/**
 * Best-effort recalc for the enrolment behind a single attendance record. Resolves
 * (enrollmentId, session.levelSubjectId) from the record, then recalcs. Used by the
 * record-mark/update and justification approve/reject triggers. Non-blocking; a
 * NULL enrollmentId is safely ignored.
 */
export function triggerAttendanceSummaryRecalcForRecord(
  context: ServiceContext,
  attendanceRecordId: string
): void {
  void (async () => {
    const db = await getDb();
    const rec = await db.attendanceRecord.findFirst({
      where: { id: attendanceRecordId, organizationId: context.organizationId, deletedAt: null },
      select: { enrollmentId: true, attendanceSession: { select: { levelSubjectId: true } } },
    });
    if (!rec?.enrollmentId) return;
    await recalculateStudentSubjectAttendanceSummary(context, {
      enrollmentId: rec.enrollmentId,
      levelSubjectId: rec.attendanceSession.levelSubjectId,
    });
  })().catch((err) =>
    console.error(`[attendance-summary] trigger record recalc failed for ${attendanceRecordId}`, err)
  );
}
