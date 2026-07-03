import type { ServiceContext } from "@/shared/types/common";
import type { AuthContext } from "@/server/auth/context";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { recalculateSubjectProgressCascade } from "@/modules/grades/services/subject-progress-cascade.service";
import { loadEffectiveAttendancePolicy } from "@/modules/attendance/services/attendance-policy.resolver";

// =============================================================================
// ATTENDANCE → ACADEMIC WIRING — Attendance Engine Phase 5 (GATED, opt-in)
//
// Bridges a changed StudentSubjectAttendanceSummary into the academic cascade
// (subject → level → course) so low attendance can produce INCOMPLETE. This is
// the ONLY attendance code that can change academic outcomes, and it does so
// ONLY when the effective policy has enforceAttendanceForProgress = true.
//
// The actual attendance→grade decision lives in the cascade itself
// (subject-progress-cascade.service.ts), which reads the persisted summary + the
// enforcement flag. This service:
//   • decides WHETHER to run the cascade (gate + stale-impact cleanup),
//   • runs it transactionally (subject/level/course commit atomically),
//   • emits the attendance-specific audit + domain events on real transitions,
//   • supports dryRun via a rolled-back transaction (no writes, no events).
//
// INCOMPLETE is non-terminal (completedAt stays null; the level treats it as
// unresolved, never FAILED) — enforced by the grade calc + level aggregation.
// =============================================================================

export interface AttendanceAcademicImpactResult {
  enforced: boolean;
  ran: boolean;
  changed: boolean;
  previousStatus: string | null;
  newStatus: string | null;
  previousAttendancePercentage: number | null;
  newAttendancePercentage: number | null;
  dryRun: boolean;
}

const ROLLBACK = Symbol("dryRun-rollback");

interface Progressish {
  status: string;
  attendancePercentage: number | null;
}

function readProgress(row: { status: string; attendancePercentage: unknown } | null): Progressish | null {
  if (!row) return null;
  return {
    status: row.status,
    attendancePercentage: row.attendancePercentage != null ? Number(row.attendancePercentage) : null,
  };
}

/**
 * Apply (or clear) the attendance academic impact for one (enrollment, subject).
 * No-op when enforcement is off AND there is no stale attendance impact to clear.
 */
export async function applyAttendanceAcademicImpact(
  context: ServiceContext,
  input: { enrollmentId: string; levelSubjectId: string },
  options: { dryRun?: boolean } = {}
): Promise<AttendanceAcademicImpactResult> {
  const { organizationId } = context;
  const { enrollmentId, levelSubjectId } = input;
  const dryRun = options.dryRun ?? false;
  const db = await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true },
  });
  if (!enrollment) throw new NotFoundError("Matrícula", enrollmentId);

  const levelSubject = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId, deletedAt: null },
    select: { attendancePolicyId: true },
  });
  if (!levelSubject) throw new NotFoundError("Configuração de disciplina", levelSubjectId);

  const policy = await loadEffectiveAttendancePolicy(organizationId, levelSubject.attendancePolicyId, db);
  const enforced = policy.enforceAttendanceForProgress;

  const previous = readProgress(
    await db.studentSubjectProgress.findFirst({
      where: { enrollmentId, levelSubjectId, organizationId },
      select: { status: true, attendancePercentage: true },
    })
  );

  // Run when enforcement is on, OR when a prior run left attendance impact that
  // must now be cleared (enforcement turned off but attendancePercentage lingers).
  const shouldRun = enforced || previous?.attendancePercentage != null;
  if (!shouldRun) {
    return {
      enforced,
      ran: false,
      changed: false,
      previousStatus: previous?.status ?? null,
      newStatus: previous?.status ?? null,
      previousAttendancePercentage: previous?.attendancePercentage ?? null,
      newAttendancePercentage: previous?.attendancePercentage ?? null,
      dryRun,
    };
  }

  const cascadeParams = { studentId: enrollment.studentId, enrollmentId, levelSubjectId };

  // ── dryRun: run the full cascade, then roll back so nothing persists ──────────
  if (dryRun) {
    let preview: Progressish | null = null;
    try {
      await db.$transaction(async (tx) => {
        const p = await recalculateSubjectProgressCascade(context as AuthContext, cascadeParams, {
          client: tx,
          events: [],
        });
        preview = { status: p.status, attendancePercentage: p.attendancePercentage != null ? Number(p.attendancePercentage) : null };
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
    const next = preview as Progressish | null;
    return {
      enforced,
      ran: true,
      changed: !!next && (previous?.status ?? null) !== next.status,
      previousStatus: previous?.status ?? null,
      newStatus: next?.status ?? null,
      previousAttendancePercentage: previous?.attendancePercentage ?? null,
      newAttendancePercentage: next?.attendancePercentage ?? null,
      dryRun: true,
    };
  }

  // ── real run: cascade + attendance-specific audit in one tx ──────────────────
  const events: DomainEvent[] = [];
  let next: Progressish = previous ?? { status: "NOT_STARTED", attendancePercentage: null };

  await db.$transaction(async (tx) => {
    const progress = await recalculateSubjectProgressCascade(context as AuthContext, cascadeParams, {
      client: tx,
      events,
    });
    next = {
      status: progress.status,
      attendancePercentage: progress.attendancePercentage != null ? Number(progress.attendancePercentage) : null,
    };

    const prevStatus = previous?.status ?? null;
    const statusChanged = prevStatus !== next.status;
    const pctChanged = (previous?.attendancePercentage ?? null) !== next.attendancePercentage;
    if (!statusChanged && !pctChanged) return; // nothing meaningful changed

    const payload = {
      enrollmentId,
      studentId: enrollment.studentId,
      levelSubjectId,
      previousStatus: prevStatus,
      newStatus: next.status,
      previousAttendancePercentage: previous?.attendancePercentage ?? null,
      newAttendancePercentage: next.attendancePercentage,
      policyId: policy.policyId,
    };

    // Precise transition audit + events.
    if (statusChanged && next.status === "INCOMPLETE") {
      await auditService.log(context, {
        entity: "StudentSubjectProgress",
        entityId: progress.id,
        action: "student_subject_progress.marked_incomplete",
        oldValues: { status: prevStatus, attendancePercentage: previous?.attendancePercentage ?? null },
        newValues: payload,
      }, tx);
      events.push(event(DomainEventType.ATTENDANCE_SUBJECT_MARKED_INCOMPLETE, organizationId, progress.id, payload, context.userId));
    } else if (statusChanged && prevStatus === "INCOMPLETE") {
      await auditService.log(context, {
        entity: "StudentSubjectProgress",
        entityId: progress.id,
        action: "student_subject_progress.recovered_from_incomplete",
        oldValues: { status: prevStatus, attendancePercentage: previous?.attendancePercentage ?? null },
        newValues: payload,
      }, tx);
      events.push(event(DomainEventType.ATTENDANCE_SUBJECT_RECOVERED_FROM_INCOMPLETE, organizationId, progress.id, payload, context.userId));
    }

    // General "attendance applied" trail (only while enforcement is on).
    if (enforced) {
      await auditService.log(context, {
        entity: "StudentSubjectProgress",
        entityId: progress.id,
        action: "student_subject_progress.attendance_applied",
        newValues: payload,
      }, tx);
      events.push(event(DomainEventType.ATTENDANCE_ACADEMIC_IMPACT_APPLIED, organizationId, progress.id, payload, context.userId));
    }
  });

  for (const e of events) await eventPublisher.publish(e);

  return {
    enforced,
    ran: true,
    changed: (previous?.status ?? null) !== next.status || (previous?.attendancePercentage ?? null) !== next.attendancePercentage,
    previousStatus: previous?.status ?? null,
    newStatus: next.status,
    previousAttendancePercentage: previous?.attendancePercentage ?? null,
    newAttendancePercentage: next.attendancePercentage,
    dryRun: false,
  };
}

function event(
  eventType: DomainEvent["eventType"],
  organizationId: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  actorId: string
): DomainEvent {
  return {
    organizationId,
    eventType,
    aggregateType: DomainAggregateType.STUDENT,
    aggregateId,
    payload,
    actorId,
  };
}
