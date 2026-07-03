import type { ServiceContext } from "@/shared/types/common";
import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import {
  findEnrollmentContextForPeriod,
  findPeriodCalcRecords,
  findLevelSubjectsForPeriod,
  findPeriodSummary,
  upsertPeriodSummary,
} from "@/modules/attendance/repositories/student-period-attendance-summary.repository";
import {
  findRawOrgDefaultPolicy,
  findRawPoliciesByIds,
  resolveAttendancePolicy,
} from "@/modules/attendance/services/attendance-policy.resolver";
import { calculatePeriodAttendanceSummary } from "@/modules/attendance/services/attendance-period-calculation.engine";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";
import type { EffectiveAttendancePolicy, PeriodCalcRecord, PeriodSummaryRecalcResult } from "@/modules/attendance/types";

// =============================================================================
// STUDENT PERIOD ATTENDANCE SUMMARY SERVICE — Attendance Engine Phase 4
//
// THE SINGLE WRITER of StudentPeriodAttendanceSummary (reporting read-model).
// Reporting-only: it NEVER writes StudentSubjectProgress.attendancePercentage,
// runs the academic cascade, or activates INCOMPLETE. The subject summary
// (Phase 3) remains the academic source.
//
// Policy is resolved PER levelSubject (a period spans many subjects, each of
// which may carry its own attendancePolicyId override); minutes are weighted
// per record and then aggregated. Transaction shape mirrors Phase 3 (read →
// upsert → audit in one tx; events published only AFTER commit). Idempotent.
// =============================================================================

export interface PeriodRecalcOptions {
  emitEvents?: boolean; // default true
  dryRun?: boolean; // default false — when true, compute only, no writes/audit/events
}

function metricsDiffer(
  prev: { attendancePercentage: number | null; status: string } | null,
  next: { attendancePercentage: number | null; status: string }
): boolean {
  if (!prev) return true;
  return prev.attendancePercentage !== next.attendancePercentage || prev.status !== next.status;
}

/**
 * Recalculate + persist ONE period summary for (enrollment, academicYear, [term]).
 * `academicTermId = null` → the whole-year rollup (all terms); a term id → that
 * term only. Transactional + idempotent. `dryRun` computes without writing.
 */
export async function recalculateStudentPeriodAttendanceSummary(
  context: ServiceContext,
  input: { enrollmentId: string; academicYearId: string; academicTermId?: string | null },
  options: PeriodRecalcOptions = {}
): Promise<PeriodSummaryRecalcResult> {
  const { organizationId } = context;
  const { enrollmentId, academicYearId } = input;
  const academicTermId = input.academicTermId ?? null;
  const emitEvents = options.emitEvents ?? true;
  const dryRun = options.dryRun ?? false;
  const db = await getDb();

  const enrollment = await findEnrollmentContextForPeriod(enrollmentId, organizationId);
  if (!enrollment) throw new NotFoundError("Matrícula", enrollmentId);

  const rawRecords = await findPeriodCalcRecords(enrollmentId, academicYearId, academicTermId, organizationId);

  // Resolve a policy + threshold PER levelSubject (shared org-default fetch).
  const levelSubjectIds = [...new Set(rawRecords.map((r) => r.levelSubjectId))];
  const levelSubjects = await findLevelSubjectsForPeriod(levelSubjectIds, organizationId);
  const orgDefault = await findRawOrgDefaultPolicy(organizationId);
  const overrideIds = [...levelSubjects.values()].map((ls) => ls.attendancePolicyId).filter((id): id is string => id != null);
  const overridePolicies = await findRawPoliciesByIds(organizationId, overrideIds);

  const policyByLevelSubject = new Map<string, EffectiveAttendancePolicy>();
  for (const [lsId, ls] of levelSubjects) {
    const override = ls.attendancePolicyId ? overridePolicies.get(ls.attendancePolicyId) ?? null : null;
    policyByLevelSubject.set(lsId, resolveAttendancePolicy(override, orgDefault));
  }

  const atRiskBufferPercentage = orgDefault
    ? Number(orgDefault.atRiskBufferPercentage)
    : DEFAULT_ATTENDANCE_POLICY.atRiskBufferPercentage;

  const records: PeriodCalcRecord[] = rawRecords.map((r) => {
    const ls = levelSubjects.get(r.levelSubjectId);
    const policy =
      policyByLevelSubject.get(r.levelSubjectId) ??
      resolveAttendancePolicy(null, orgDefault); // subject not found → org default / fallback
    return {
      levelSubjectId: r.levelSubjectId,
      durationMinutes: r.durationMinutes,
      status: r.status,
      minutesAttended: r.minutesAttended,
      lateMinutes: r.lateMinutes,
      hasApprovedJustification: r.hasApprovedJustification,
      policy,
      minimumAttendancePercentage: ls?.minimumAttendancePercentage ?? null,
    };
  });

  const computed = calculatePeriodAttendanceSummary({ records, atRiskBufferPercentage });
  const next = { attendancePercentage: computed.attendancePercentage, status: computed.status };

  // Read the previous value (outside/before the write) for change detection.
  const before = await findPeriodSummary(enrollmentId, academicYearId, academicTermId, organizationId, db);
  const previous = before ? { attendancePercentage: before.attendancePercentage, status: before.status } : null;

  if (dryRun) {
    return { enrollmentId, academicYearId, academicTermId, changed: metricsDiffer(previous, next), dryRun: true, previous, next };
  }

  const events: DomainEvent[] = [];
  let changed = false;

  await db.$transaction(async (tx) => {
    const existing = await findPeriodSummary(enrollmentId, academicYearId, academicTermId, organizationId, tx);

    const anyFieldChanged =
      !existing ||
      existing.totalSessions !== computed.totalSessions ||
      existing.presentCount !== computed.presentCount ||
      existing.absentCount !== computed.absentCount ||
      existing.lateCount !== computed.lateCount ||
      existing.excusedCount !== computed.excusedCount ||
      existing.remoteCount !== computed.remoteCount ||
      existing.totalScheduledMinutes !== computed.totalScheduledMinutes ||
      existing.totalPresentMinutes !== computed.totalPresentMinutes ||
      existing.attendancePercentage !== computed.attendancePercentage ||
      existing.status !== computed.status;

    if (!anyFieldChanged) return; // idempotent — nothing to write

    const summary = await upsertPeriodSummary(
      {
        organizationId,
        academicYearId,
        academicTermId,
        enrollmentId,
        studentId: enrollment.studentId,
        courseId: enrollment.courseId,
        courseLevelId: enrollment.courseLevelId,
        classGroupId: enrollment.classGroupId,
        totalSessions: computed.totalSessions,
        presentCount: computed.presentCount,
        absentCount: computed.absentCount,
        lateCount: computed.lateCount,
        excusedCount: computed.excusedCount,
        remoteCount: computed.remoteCount,
        totalScheduledMinutes: computed.totalScheduledMinutes,
        totalPresentMinutes: computed.totalPresentMinutes,
        attendancePercentage: computed.attendancePercentage,
        status: computed.status,
        calculatedAt: new Date(),
      },
      tx
    );

    if (metricsDiffer(previous, next)) {
      changed = true;
      await auditService.log(
        context,
        {
          entity: "StudentPeriodAttendanceSummary",
          entityId: summary.id,
          action: "attendance_period_summary.recalculated",
          oldValues: previous ? { attendancePercentage: previous.attendancePercentage, status: previous.status } : null,
          newValues: {
            enrollmentId,
            studentId: enrollment.studentId,
            academicYearId,
            academicTermId,
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
        academicYearId,
        academicTermId,
        previousAttendancePercentage: previous?.attendancePercentage ?? null,
        newAttendancePercentage: next.attendancePercentage,
        previousStatus: previous?.status ?? null,
        newStatus: next.status,
        calculatedAt: summary.calculatedAt,
      };

      events.push({
        organizationId,
        eventType: DomainEventType.ATTENDANCE_PERIOD_SUMMARY_RECALCULATED,
        aggregateType: DomainAggregateType.ATTENDANCE,
        aggregateId: summary.id,
        payload: basePayload,
        actorId: context.userId,
      });

      // Transition events fire only on an actual status change (needs a prior value).
      if (previous && previous.status !== next.status) {
        if (next.status === "BELOW_REQUIRED") {
          events.push(transitionEvent(DomainEventType.ATTENDANCE_PERIOD_BELOW_REQUIRED, organizationId, summary.id, basePayload, context.userId));
        } else if (next.status === "AT_RISK") {
          events.push(transitionEvent(DomainEventType.ATTENDANCE_PERIOD_AT_RISK, organizationId, summary.id, basePayload, context.userId));
        } else if (next.status === "GOOD") {
          events.push(transitionEvent(DomainEventType.ATTENDANCE_PERIOD_RECOVERED, organizationId, summary.id, basePayload, context.userId));
        }
      }
    }
  });

  if (emitEvents) {
    for (const event of events) await eventPublisher.publish(event);
  }

  return { enrollmentId, academicYearId, academicTermId, changed, dryRun: false, previous, next };
}

function transitionEvent(
  eventType: DomainEvent["eventType"],
  organizationId: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  actorId: string
): DomainEvent {
  return { organizationId, eventType, aggregateType: DomainAggregateType.ATTENDANCE, aggregateId, payload, actorId };
}

// ─── Fire-and-forget triggers (behaviour-neutral: never roll back the mutation) ─

/** Recalc the year rollup AND (if the session has a term) the term summary for one
 *  enrolment. Best-effort per period; used by the record/session triggers. */
async function recalcEnrollmentPeriods(
  context: ServiceContext,
  enrollmentId: string,
  academicYearId: string,
  academicTermId: string | null
): Promise<void> {
  // Year rollup (term = null) always; the specific term when present.
  await recalculateStudentPeriodAttendanceSummary(context, { enrollmentId, academicYearId, academicTermId: null });
  if (academicTermId) {
    await recalculateStudentPeriodAttendanceSummary(context, { enrollmentId, academicYearId, academicTermId });
  }
}

/** Best-effort period recalc for the enrolment behind one attendance record. */
export function triggerPeriodSummaryRecalcForRecord(context: ServiceContext, attendanceRecordId: string): void {
  void (async () => {
    const db = await getDb();
    const rec = await db.attendanceRecord.findFirst({
      where: { id: attendanceRecordId, organizationId: context.organizationId, deletedAt: null },
      select: {
        enrollmentId: true,
        attendanceSession: { select: { academicYearId: true, academicTermId: true } },
      },
    });
    if (!rec?.enrollmentId) return;
    await recalcEnrollmentPeriods(
      context,
      rec.enrollmentId,
      rec.attendanceSession.academicYearId,
      rec.attendanceSession.academicTermId ?? null
    );
  })().catch((err) =>
    console.error(`[attendance-period] trigger record recalc failed for ${attendanceRecordId}`, err)
  );
}

/** Best-effort period recalc fan-out for every enrolment marked in a session. */
export function triggerPeriodSummaryRecalcForSession(context: ServiceContext, sessionId: string): void {
  void (async () => {
    const db = await getDb();
    const session = await db.attendanceSession.findFirst({
      where: { id: sessionId, organizationId: context.organizationId, deletedAt: null },
      select: { academicYearId: true, academicTermId: true },
    });
    if (!session) return;
    const rows = await db.attendanceRecord.findMany({
      where: { attendanceSessionId: sessionId, organizationId: context.organizationId, deletedAt: null, enrollmentId: { not: null } },
      select: { enrollmentId: true },
      distinct: ["enrollmentId"],
    });
    for (const r of rows) {
      if (!r.enrollmentId) continue;
      try {
        await recalcEnrollmentPeriods(context, r.enrollmentId, session.academicYearId, session.academicTermId ?? null);
      } catch (err) {
        console.error(`[attendance-period] session recalc failed for enrollment ${r.enrollmentId}`, err);
      }
    }
  })().catch((err) => console.error(`[attendance-period] trigger session recalc failed for ${sessionId}`, err));
}
