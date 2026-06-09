import { getDb } from "@/server/db";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { calculateStudentSubjectAttendance } from "./attendance-calculator.service";

// =============================================================================
// ATTENDANCE RISK SERVICE
//
// Purpose: evaluate risk conditions AFTER attendance data changes.
// Called by CompleteAttendanceSessionCommand after a session is completed.
//
// Idempotency:
//   Events are only emitted on state TRANSITIONS, not on every calculation.
//   We store the last-known risk state in a lightweight cache key:
//     risk_state:{organizationId}:{studentId}:{levelSubjectId}
//   For simplicity, we query the last domain event to detect re-emission.
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
      subject: { select: { name: true } },
    },
  });

  if (!levelSubject?.minimumAttendancePercentage) return;

  const minPct = Number(levelSubject.minimumAttendancePercentage);
  const AT_RISK_THRESHOLD = minPct + 5;
  const subjectName = levelSubject.subject?.name ?? "";

  for (const enrollment of enrollments) {
    if (!enrollment.classGroupId) continue;

    try {
      const summary = await calculateStudentSubjectAttendance(
        enrollment.studentId,
        enrollment.id,
        enrollment.classGroupId,
        session.levelSubjectId,
        organizationId
      );

      await maybeEmitRiskEvent(
        organizationId,
        enrollment.studentId,
        enrollment.id,
        session.levelSubjectId,
        summary.attendancePercentage,
        minPct,
        AT_RISK_THRESHOLD,
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
  minimumPercentage: number,
  atRiskThreshold: number,
  subjectName: string
): Promise<void> {
  if (currentPercentage < minimumPercentage) {
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
