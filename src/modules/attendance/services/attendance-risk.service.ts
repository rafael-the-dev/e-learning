import { getDb } from "@/server/db";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { findSummaryByEnrollmentAndSubject } from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import { loadEffectiveAttendancePolicy } from "@/modules/attendance/services/attendance-policy.resolver";
import { StudentSubjectAttendanceSummaryStatus } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE RISK SERVICE
//
// Purpose: emit risk notifications AFTER attendance data changes.
// Called by CompleteAttendanceSessionCommand once a session is completed AND the
// persisted subject summaries have been recalculated (see the command ordering).
//
// Source of truth: this service NEVER recomputes attendance from raw records.
// It reads the persisted `StudentSubjectAttendanceSummary` (Attendance Engine
// Phase 3) — the single source of truth — with the same semantics operators see
// in reports and Student 360. The retired legacy calculator is not used.
//   • BELOW_REQUIRED comes straight from the summary status.
//   • AT_RISK is derived from the summary percentage vs the subject minimum plus
//     the effective policy's atRiskBufferPercentage.
//   • A missing summary (or null percentage → NOT_STARTED) yields no risk signal;
//     we do not fabricate a percentage by recalculating on-read.
//
// Idempotency:
//   Events are only emitted on state TRANSITIONS, not on every calculation.
//   We detect re-emission by querying the last matching domain event.
// =============================================================================

export async function evaluateAttendanceRiskForSession(
  sessionId: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();

  // Load the session with its classGroupId and levelSubjectId
  const session = await db.attendanceSession.findFirst({
    where: { id: sessionId, organizationId },
    select: { classGroupId: true, levelSubjectId: true, subjectId: true },
  });
  if (!session) return;

  // Load all ACTIVE enrollments for this class group
  const enrollments = await db.enrollment.findMany({
    where: {
      classGroupId: session.classGroupId,
      organizationId,
      status: "ACTIVE",
      deletedAt: null,
    },
    select: {
      id: true,
      studentId: true,
      classGroupId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  const levelSubject = await db.levelSubject.findFirst({
    where: { id: session.levelSubjectId, organizationId },
    select: {
      minimumAttendancePercentage: true,
      attendancePolicyId: true,
      subject: { select: { name: true } },
    },
  });

  if (!levelSubject?.minimumAttendancePercentage) return;

  const minPct = Number(levelSubject.minimumAttendancePercentage);
  // AT_RISK band width comes from the effective policy (LevelSubject override →
  // org default → deterministic fallback), matching the read-model display band.
  const policy = await loadEffectiveAttendancePolicy(
    organizationId,
    levelSubject.attendancePolicyId,
    db
  );
  const atRiskThreshold = minPct + policy.atRiskBufferPercentage;
  const subjectName = levelSubject.subject?.name ?? "";

  for (const enrollment of enrollments) {
    if (!enrollment.classGroupId) continue;

    try {
      // Source of truth: the persisted summary. NEVER recomputed on-read.
      const summary = await findSummaryByEnrollmentAndSubject(
        enrollment.id,
        session.levelSubjectId,
        organizationId
      );

      // No summary yet, or attendance not started (null percentage / NOT_STARTED)
      // → no risk signal. We do not fabricate a percentage by recalculating.
      if (!summary || summary.attendancePercentage == null) continue;

      await maybeEmitRiskEvent(
        organizationId,
        enrollment.studentId,
        enrollment.id,
        session.levelSubjectId,
        summary.attendancePercentage,
        summary.status,
        minPct,
        atRiskThreshold,
        subjectName
      );
    } catch {
      // Per-student failure must not block other students
    }
  }
}

async function maybeEmitRiskEvent(
  organizationId: string,
  studentId: string,
  enrollmentId: string,
  levelSubjectId: string,
  currentPercentage: number,
  summaryStatus: string,
  minimumPercentage: number,
  atRiskThreshold: number,
  subjectName: string
): Promise<void> {
  // BELOW_REQUIRED is decided by the persisted summary status (source of truth),
  // not by re-comparing the percentage here — the summary already applied the
  // policy semantics (countExcusedAsPresent, approved justifications, …).
  if (summaryStatus === StudentSubjectAttendanceSummaryStatus.BELOW_REQUIRED) {
    // Check if we already emitted student_below_required recently (idempotency)
    const alreadyEmitted = await hasRecentEvent(
      organizationId,
      studentId,
      levelSubjectId,
      DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED
    );
    if (alreadyEmitted) return;

    await eventPublisher.publish({
      organizationId,
      eventType: DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED,
      aggregateType: DomainAggregateType.ATTENDANCE,
      aggregateId: enrollmentId,
      payload: {
        studentId,
        enrollmentId,
        levelSubjectId,
        subjectName,
        currentPercentage,
        minimumPercentage,
      },
    });
  } else if (currentPercentage < atRiskThreshold) {
    // SUFFICIENT but within the at-risk buffer of the minimum.
    const alreadyEmitted = await hasRecentEvent(
      organizationId,
      studentId,
      levelSubjectId,
      DomainEventType.ATTENDANCE_STUDENT_AT_RISK
    );
    if (alreadyEmitted) return;

    await eventPublisher.publish({
      organizationId,
      eventType: DomainEventType.ATTENDANCE_STUDENT_AT_RISK,
      aggregateType: DomainAggregateType.ATTENDANCE,
      aggregateId: enrollmentId,
      payload: {
        studentId,
        enrollmentId,
        levelSubjectId,
        subjectName,
        currentPercentage,
        minimumPercentage,
      },
    });
  }
  // If above threshold → no event; risk cleared naturally
}

// Checks if a risk event for the same (student, levelSubject) was already
// emitted and is still in PROCESSED state (meaning it was handled already).
// This prevents duplicate notifications while the student remains at the same risk level.
async function hasRecentEvent(
  organizationId: string,
  studentId: string,
  levelSubjectId: string,
  eventType: string
): Promise<boolean> {
  const db = await getDb();
  // Both studentId and levelSubjectId must appear in the payload to avoid
  // a risk event for Subject A suppressing the event for Subject B for the same student.
  const count = await db.domainEvent.count({
    where: {
      organizationId,
      eventType,
      status: { in: ["PENDING", "PROCESSING", "PROCESSED"] },
      AND: [
        { payload: { contains: studentId } },
        { payload: { contains: levelSubjectId } },
      ],
    },
  });
  return count > 0;
}
