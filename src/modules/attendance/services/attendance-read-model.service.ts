import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  findSubjectAttendanceSummariesByClassGroup,
  findSubjectAttendanceSummaryByEnrollment,
} from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import { findPeriodAttendanceSummariesByStudent } from "@/modules/attendance/repositories/student-period-attendance-summary.repository";
import type {
  StudentSubjectAttendanceSummary,
  SubjectAttendanceView,
  SubjectAttendanceDisplayStatus,
  ClassGroupAttendanceReportEntry,
  StudentAttendanceCounts,
} from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE READ-MODEL SERVICE
//
// The single read path for subject attendance shown to operators. Numbers come
// verbatim from the persisted `StudentSubjectAttendanceSummary` (Phase 3) — the
// source of truth. This service NEVER recomputes attendance from raw records
// (that is what the retired `attendance-calculator.service.ts` did, with
// divergent semantics). A missing summary yields `NOT_STARTED` / `null` /
// `needsRecalculation: true`; it is never fabricated.
//
// `status` is a PURE display derivation from the persisted percentage + the
// LevelSubject threshold. `AT_RISK` refines the summary's `SUFFICIENT` band and
// never contradicts `BELOW_REQUIRED`.
// =============================================================================

/** Default at-risk buffer (percentage points above the minimum) used for the
 *  display band, matching `DEFAULT_ATTENDANCE_POLICY.atRiskBufferPercentage`. */
export const DEFAULT_DISPLAY_AT_RISK_BUFFER = 5;

/**
 * Pure derivation of the display status from the persisted percentage + the
 * subject threshold. Does NOT touch the database or recompute anything.
 * - null percentage → NOT_STARTED
 * - percentage < minimum → BELOW_REQUIRED
 * - percentage < minimum + buffer → AT_RISK
 * - otherwise → OK
 */
export function deriveSubjectAttendanceDisplayStatus(
  attendancePercentage: number | null,
  minimumAttendancePercentage: number | null,
  atRiskBuffer: number = DEFAULT_DISPLAY_AT_RISK_BUFFER
): SubjectAttendanceDisplayStatus {
  if (attendancePercentage == null) return "NOT_STARTED";
  if (minimumAttendancePercentage == null) return "OK";
  if (attendancePercentage < minimumAttendancePercentage) return "BELOW_REQUIRED";
  if (attendancePercentage < minimumAttendancePercentage + atRiskBuffer) return "AT_RISK";
  return "OK";
}

interface LevelSubjectMeta {
  levelSubjectId: string;
  subjectId: string;
  subjectName: string;
  minimumAttendancePercentage: number | null;
}

/** Map a persisted summary (or its absence) to the read-model view. Subject name
 *  and threshold come from the LevelSubject (always available, even NOT_STARTED). */
export function toSubjectAttendanceView(params: {
  studentId: string;
  enrollmentId: string;
  meta: LevelSubjectMeta;
  summary: StudentSubjectAttendanceSummary | null;
  atRiskBuffer?: number;
}): SubjectAttendanceView {
  const { studentId, enrollmentId, meta, summary, atRiskBuffer } = params;
  const attendancePercentage = summary?.attendancePercentage ?? null;
  return {
    studentId,
    enrollmentId,
    levelSubjectId: meta.levelSubjectId,
    subjectId: meta.subjectId,
    subjectName: meta.subjectName,
    totalSessions: summary?.totalSessions ?? 0,
    totalScheduledMinutes: summary?.totalScheduledMinutes ?? 0,
    totalPresentMinutes: summary?.totalPresentMinutes ?? 0,
    totalAbsentMinutes: summary?.totalAbsentMinutes ?? 0,
    totalLateMinutes: summary?.totalLateMinutes ?? 0,
    totalExcusedMinutes: summary?.totalExcusedMinutes ?? 0,
    attendancePercentage,
    minimumAttendancePercentage: meta.minimumAttendancePercentage,
    status: deriveSubjectAttendanceDisplayStatus(
      attendancePercentage,
      meta.minimumAttendancePercentage,
      atRiskBuffer
    ),
    needsRecalculation: summary == null,
    calculatedAt: summary?.calculatedAt ?? null,
  };
}

function toNumber(value: unknown): number | null {
  return value != null ? Number(value) : null;
}

async function loadLevelSubjectsForLevel(
  courseLevelId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<LevelSubjectMeta[]> {
  const db = client ?? (await getDb());
  const rows = await db.levelSubject.findMany({
    where: { courseLevelId, organizationId, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      subjectId: true,
      minimumAttendancePercentage: true,
      subject: { select: { name: true } },
      order: true,
    },
    orderBy: { order: "asc" },
  });
  return rows.map((ls) => ({
    levelSubjectId: ls.id,
    subjectId: ls.subjectId,
    subjectName: ls.subject?.name ?? "",
    minimumAttendancePercentage: toNumber(ls.minimumAttendancePercentage),
  }));
}

/**
 * Class-group attendance report grid, sourced from the persisted subject
 * summaries in a SINGLE query (no per-student/per-subject fan-out). Every
 * (enrollment, levelSubject) cell is a `SubjectAttendanceView`; missing summaries
 * render as NOT_STARTED / null / needsRecalculation.
 */
export async function getClassGroupSubjectAttendanceReport(
  classGroupId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<ClassGroupAttendanceReportEntry[]> {
  const db = client ?? (await getDb());

  const classGroup = await db.classGroup.findFirst({
    where: { id: classGroupId, organizationId, deletedAt: null },
    select: { id: true, courseLevelId: true },
  });
  if (!classGroup?.courseLevelId) return [];

  const [enrollments, levelSubjects, summaries] = await Promise.all([
    db.enrollment.findMany({
      where: { classGroupId, organizationId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true, code: true } },
      },
      orderBy: [{ student: { firstName: "asc" } }],
    }),
    loadLevelSubjectsForLevel(classGroup.courseLevelId, organizationId, db),
    findSubjectAttendanceSummariesByClassGroup(classGroupId, organizationId, db),
  ]);

  const summaryByKey = new Map<string, StudentSubjectAttendanceSummary>();
  for (const s of summaries) {
    summaryByKey.set(`${s.enrollmentId}|${s.levelSubjectId}`, s);
  }

  return enrollments.map((enrollment) => ({
    studentId: enrollment.studentId,
    studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
    studentCode: enrollment.student.code ?? null,
    subjects: levelSubjects.map((meta) =>
      toSubjectAttendanceView({
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        meta,
        summary: summaryByKey.get(`${enrollment.id}|${meta.levelSubjectId}`) ?? null,
      })
    ),
  }));
}

/**
 * Per-subject attendance views for a student across the given active
 * enrolments, sourced from the persisted subject summaries. One levelSubject
 * query + one summary query per enrolment (no per-subject fan-out).
 */
export async function getStudentSubjectAttendanceViews(
  studentId: string,
  activeEnrollments: { id: string; classGroupId: string | null }[],
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<SubjectAttendanceView[]> {
  const db = client ?? (await getDb());

  const scoped = activeEnrollments.filter((e) => e.classGroupId);
  const perEnrollment = await Promise.all(
    scoped.map(async (enrollment) => {
      const context = await db.enrollment.findFirst({
        where: { id: enrollment.id, organizationId, deletedAt: null },
        select: { courseLevelId: true },
      });
      if (!context?.courseLevelId) return [] as SubjectAttendanceView[];

      const [levelSubjects, summaries] = await Promise.all([
        loadLevelSubjectsForLevel(context.courseLevelId, organizationId, db),
        findSubjectAttendanceSummaryByEnrollment(enrollment.id, organizationId, db),
      ]);
      const summaryByLevelSubject = new Map<string, StudentSubjectAttendanceSummary>();
      for (const s of summaries) summaryByLevelSubject.set(s.levelSubjectId, s);

      return levelSubjects.map((meta) =>
        toSubjectAttendanceView({
          studentId,
          enrollmentId: enrollment.id,
          meta,
          summary: summaryByLevelSubject.get(meta.levelSubjectId) ?? null,
        })
      );
    })
  );

  return perEnrollment.flat();
}

/**
 * Aggregate session counts for a student, summed from the persisted period
 * year-rollups (`academicTermId = null`, at most one per enrolment+year). This
 * is the reporting source that persists per-status counts; the subject summary
 * does not. Returns zeros when no period rollups exist yet.
 */
export async function getStudentAttendanceCounts(
  studentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentAttendanceCounts> {
  const periods = await findPeriodAttendanceSummariesByStudent(studentId, organizationId, client);
  const yearRollups = periods.filter((p) => p.academicTermId === null);

  return yearRollups.reduce<StudentAttendanceCounts>(
    (acc, p) => ({
      totalSessions: acc.totalSessions + p.totalSessions,
      presentCount: acc.presentCount + p.presentCount,
      absentCount: acc.absentCount + p.absentCount,
      lateCount: acc.lateCount + p.lateCount,
      excusedCount: acc.excusedCount + p.excusedCount,
      remoteCount: acc.remoteCount + p.remoteCount,
    }),
    { totalSessions: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0 }
  );
}
