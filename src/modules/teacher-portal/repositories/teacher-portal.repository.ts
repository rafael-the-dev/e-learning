import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import { findUpcomingEventsByOrganization } from "@/modules/academic-calendar/repositories/academic-event.repository";
import { getStudentIdsWithDimensionRisk } from "@/modules/students/repositories/student-risk-projection.repository";
import { getStudentRiskProjectionCoverage } from "@/modules/students/services/student-risk-projection-coverage.service";
import type {
  TeacherTodaySession,
  AttendancePendingRow,
  AssessmentToGradeRow,
  ResultToPublishRow,
  StudentRiskRow,
  TeacherDeadline,
} from "@/modules/teacher-portal/types";

// =============================================================================
// TEACHER PORTAL REPOSITORY
// All queries are scoped to organizationId + teacherId (or to the teacher's
// own active class groups). Never query cross-tenant or cross-teacher.
// Counts/metrics already computed by Teacher 360
// (src/modules/teachers/teacher-360/repositories/teacher-360.repository.ts)
// are reused from there rather than re-derived here — see
// teacher-portal.service.ts.
// =============================================================================

const ROW_LIMIT = 10;

function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

export async function findTeacherTodaySessions(
  teacherId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<TeacherTodaySession[]> {
  const db = await getDb();
  const { start, end } = dayBounds(now);

  const rows = await db.attendanceSession.findMany({
    where: { teacherId, organizationId, sessionDate: { gte: start, lte: end } },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      classGroup: { select: { id: true, name: true } },
      subject: { select: { name: true } },
      classroom: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    startTime: r.startTime,
    endTime: r.endTime,
    classGroupId: r.classGroup.id,
    classGroupName: r.classGroup.name,
    subjectName: r.subject.name,
    classroomName: r.classroom?.name ?? null,
    status: r.status,
  }));
}

export async function countTeacherAttendancePending(
  teacherId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.attendanceSession.count({
    where: {
      teacherId,
      organizationId,
      status: { in: ["OPEN", "COMPLETED"] },
      records: { none: { deletedAt: null } },
    },
  });
}

/**
 * Same definition the "Avaliações a Corrigir" Pending Work tab uses
 * (findTeacherAssessmentsToGradeRows below) — OPEN assessments only, so a
 * DRAFT/SCHEDULED/GRADED/CANCELLED/ARCHIVED assessment never inflates this
 * count even if it still has a stray PENDING/SUBMITTED result attached.
 */
export async function countTeacherPendingGradingResults(
  teacherId: string,
  organizationId: string
): Promise<number> {
  const db = await getDb();
  return db.assessmentResult.count({
    where: {
      organizationId,
      status: { in: ["PENDING", "SUBMITTED"] },
      deletedAt: null,
      assessment: { teacherId, status: "OPEN", deletedAt: null },
    },
  });
}

export async function findTeacherAttendancePendingRows(
  teacherId: string,
  organizationId: string,
  limit: number = ROW_LIMIT
): Promise<AttendancePendingRow[]> {
  const db = await getDb();
  const rows = await db.attendanceSession.findMany({
    where: {
      teacherId,
      organizationId,
      status: { in: ["OPEN", "COMPLETED"] },
      records: { none: { deletedAt: null } },
    },
    select: {
      id: true,
      sessionDate: true,
      startTime: true,
      classGroup: { select: { id: true, name: true, currentCount: true } },
      subject: { select: { name: true } },
    },
    orderBy: { sessionDate: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    sessionId: r.id,
    classGroupId: r.classGroup.id,
    classGroupName: r.classGroup.name,
    subjectName: r.subject.name,
    sessionDate: r.sessionDate,
    startTime: r.startTime,
    missingCount: r.classGroup.currentCount,
  }));
}

/**
 * Assessment.subjectId carries no Prisma relation to Subject — resolved with a
 * separate lookup. The ids passed in are always harvested from rows already
 * scoped to (teacherId, organizationId), but we still re-assert organizationId
 * here so every query in this module is tenant-bound on its own, not only by
 * trust in its caller.
 */
async function findSubjectNamesByIds(
  subjectIds: string[],
  organizationId: string
): Promise<Map<string, string>> {
  if (subjectIds.length === 0) return new Map();
  const db = await getDb();
  const subjects = await db.subject.findMany({
    where: { id: { in: subjectIds }, organizationId },
    select: { id: true, name: true },
  });
  return new Map(subjects.map((s) => [s.id, s.name]));
}

export async function findTeacherAssessmentsToGradeRows(
  teacherId: string,
  organizationId: string,
  limit: number = ROW_LIMIT
): Promise<AssessmentToGradeRow[]> {
  const db = await getDb();
  const assessments = await db.assessment.findMany({
    where: {
      teacherId,
      organizationId,
      status: "OPEN",
      deletedAt: null,
      results: { some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null } },
    },
    select: {
      id: true,
      title: true,
      assessmentDate: true,
      subjectId: true,
      classGroup: { select: { name: true } },
    },
    orderBy: { assessmentDate: "asc" },
    take: limit,
  });

  if (assessments.length === 0) return [];

  const assessmentIds = assessments.map((a) => a.id);
  const [resultGroups, subjectNames] = await Promise.all([
    db.assessmentResult.groupBy({
      by: ["assessmentId", "status"],
      where: { organizationId, assessmentId: { in: assessmentIds }, deletedAt: null },
      _count: { _all: true },
    }),
    findSubjectNamesByIds(assessments.map((a) => a.subjectId), organizationId),
  ]);

  const countsByAssessment = new Map<string, Record<string, number>>();
  for (const g of resultGroups) {
    if (!countsByAssessment.has(g.assessmentId)) countsByAssessment.set(g.assessmentId, {});
    countsByAssessment.get(g.assessmentId)![g.status] = g._count._all;
  }

  return assessments.map((a) => {
    const counts = countsByAssessment.get(a.id) ?? {};
    return {
      assessmentId: a.id,
      title: a.title,
      classGroupName: a.classGroup.name,
      subjectName: subjectNames.get(a.subjectId) ?? "—",
      submittedCount: counts["SUBMITTED"] ?? 0,
      pendingCount: counts["PENDING"] ?? 0,
      dueDate: a.assessmentDate,
    };
  });
}

export async function findTeacherResultsToPublishRows(
  teacherId: string,
  organizationId: string,
  limit: number = ROW_LIMIT
): Promise<ResultToPublishRow[]> {
  const db = await getDb();
  const assessments = await db.assessment.findMany({
    where: {
      teacherId,
      organizationId,
      status: "GRADED",
      deletedAt: null,
      publication: { publicationStatus: "READY" },
    },
    select: {
      id: true,
      title: true,
      subjectId: true,
      classGroup: { select: { name: true } },
      _count: { select: { results: true } },
    },
    take: limit,
  });

  const subjectNames = await findSubjectNamesByIds(assessments.map((a) => a.subjectId), organizationId);

  return assessments.map((a) => ({
    assessmentId: a.id,
    title: a.title,
    classGroupName: a.classGroup.name,
    subjectName: subjectNames.get(a.subjectId) ?? "—",
    readyCount: a._count.results,
  }));
}

/** SQL-side aggregation, one query — avoids N+1 across the teacher's active class groups. */
export async function findTeacherClassGroupAttendanceRates(
  teacherId: string,
  organizationId: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ classGroupId: string; avgPct: number | null }>>(Prisma.sql`
    SELECT cg.id AS classGroupId, AVG(CAST(ssp.attendancePercentage AS FLOAT)) AS avgPct
    FROM student_subject_progress ssp
    JOIN enrollments e ON e.id = ssp.enrollmentId
    JOIN class_groups cg ON cg.id = e.classGroupId
    WHERE ssp.organizationId = ${organizationId}
      AND cg.teacherId = ${teacherId}
      AND ssp.attendancePercentage IS NOT NULL
      AND cg.deletedAt IS NULL
    GROUP BY cg.id
  `);

  return new Map(rows.filter((r) => r.avgPct != null).map((r) => [r.classGroupId, Math.round(r.avgPct! * 10) / 10]));
}

// ── Risk list — scoped to the teacher's active class groups only ──────────────

const LOW_ATTENDANCE_THRESHOLD = 75;
const ATTENDANCE_TREND_THRESHOLD = 85;
/**
 * Safety cap on every risk source query — defense in depth alongside the
 * activeClassGroupIds scoping. The final display list is sliced to 20 rows
 * in teacher-portal-risk.service.ts; this `take` exists so that even a
 * teacher with an unusually large active-class population never pulls a
 * full unbounded result set into memory per risk source.
 */
const RISK_SOURCE_QUERY_LIMIT = 200;

export async function findTeacherRiskRows(
  teacherId: string,
  organizationId: string,
  activeClassGroupIds: string[]
): Promise<StudentRiskRow[]> {
  if (activeClassGroupIds.length === 0) return [];
  const db = await getDb();

  // M11.3: the attendance risk decision comes from the canonical projection once the org is
  // backfilled (per-subject minimum — the SAME decision Student 360 uses), collapsing the
  // flat LOW=75 / TREND=85 split into one at-risk answer. Until coverage exists, fall back to
  // the legacy percentage thresholds. The other sources are teacher-scoped status/assessment
  // signals not represented in the projection, so they stay.
  const covered = (await getStudentRiskProjectionCoverage({ organizationId })).ready;

  const [blocked, levelRecovery, courseRecovery, failedSubjects, legacyLowAttendance, missingAssessments] =
    await Promise.all([
      db.studentLevelProgress.findMany({
        where: { organizationId, status: "BLOCKED", enrollment: { classGroupId: { in: activeClassGroupIds } } },
        select: {
          studentId: true,
          progressReason: true,
          student: { select: { firstName: true, lastName: true } },
          enrollment: { select: { classGroup: { select: { name: true } } } },
        },
        take: RISK_SOURCE_QUERY_LIMIT,
      }),
      db.studentLevelProgress.findMany({
        where: {
          organizationId,
          status: "RECOVERY_REQUIRED",
          enrollment: { classGroupId: { in: activeClassGroupIds } },
        },
        select: {
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          enrollment: { select: { classGroup: { select: { name: true } } } },
        },
        take: RISK_SOURCE_QUERY_LIMIT,
      }),
      db.studentCourseProgress.findMany({
        where: {
          organizationId,
          status: "RECOVERY_REQUIRED",
          enrollment: { classGroupId: { in: activeClassGroupIds } },
        },
        select: {
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          enrollment: { select: { classGroup: { select: { name: true } } } },
        },
        take: RISK_SOURCE_QUERY_LIMIT,
      }),
      db.studentSubjectProgress.findMany({
        where: { organizationId, status: "FAILED", enrollment: { classGroupId: { in: activeClassGroupIds } } },
        select: {
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          enrollment: { select: { classGroup: { select: { name: true } } } },
        },
        take: RISK_SOURCE_QUERY_LIMIT,
      }),
      // Legacy attendance source — only used as the fallback when the projection is empty.
      covered
        ? Promise.resolve<
            Array<{
              studentId: string;
              attendancePercentage: unknown;
              student: { firstName: string; lastName: string };
              enrollment: { classGroup: { name: string } | null };
            }>
          >([])
        : db.studentSubjectProgress.findMany({
            where: {
              organizationId,
              attendancePercentage: { not: null, lt: ATTENDANCE_TREND_THRESHOLD },
              enrollment: { classGroupId: { in: activeClassGroupIds } },
            },
            select: {
              studentId: true,
              attendancePercentage: true,
              student: { select: { firstName: true, lastName: true } },
              enrollment: { select: { classGroup: { select: { name: true } } } },
            },
            take: RISK_SOURCE_QUERY_LIMIT,
          }),
      db.assessmentResult.findMany({
        where: { organizationId, status: "MISSING", deletedAt: null, assessment: { teacherId, deletedAt: null } },
        select: {
          studentId: true,
          student: { select: { firstName: true, lastName: true } },
          assessment: { select: { classGroup: { select: { name: true } } } },
        },
        distinct: ["studentId"],
        take: RISK_SOURCE_QUERY_LIMIT,
      }),
    ]);

  const rows: StudentRiskRow[] = [];

  for (const r of blocked) {
    rows.push({
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      classGroupName: r.enrollment.classGroup?.name ?? "—",
      riskType: "BLOCKED",
      severity: "CRITICAL",
      detail: r.progressReason ?? "Progressão bloqueada",
    });
  }
  for (const r of [...levelRecovery, ...courseRecovery]) {
    rows.push({
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      classGroupName: r.enrollment.classGroup?.name ?? "—",
      riskType: "RECOVERY_REQUIRED",
      severity: "HIGH",
      detail: "Recuperação pendente",
    });
  }
  for (const r of failedSubjects) {
    rows.push({
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      classGroupName: r.enrollment.classGroup?.name ?? "—",
      riskType: "FAILED_SUBJECT",
      severity: "HIGH",
      detail: "Disciplina reprovada",
    });
  }

  // Attendance rows — canonical projection decision when covered, else legacy thresholds.
  if (covered) {
    const candidates = await db.enrollment.findMany({
      where: { organizationId, status: "ACTIVE", deletedAt: null, classGroupId: { in: activeClassGroupIds } },
      select: {
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
        classGroup: { select: { name: true } },
      },
      take: RISK_SOURCE_QUERY_LIMIT,
    });
    const atRisk = await getStudentIdsWithDimensionRisk(
      organizationId,
      "attendance",
      [...new Set(candidates.map((c) => c.studentId))]
    );
    const seen = new Set<string>();
    for (const c of candidates) {
      if (!atRisk.has(c.studentId) || seen.has(c.studentId)) continue;
      seen.add(c.studentId);
      rows.push({
        studentId: c.studentId,
        studentName: `${c.student.firstName} ${c.student.lastName}`,
        classGroupName: c.classGroup?.name ?? "—",
        riskType: "LOW_ATTENDANCE",
        severity: "HIGH",
        detail: "Assiduidade abaixo do mínimo",
      });
    }
  } else {
    for (const r of legacyLowAttendance) {
      const pct = Number(r.attendancePercentage);
      const isHigh = pct < LOW_ATTENDANCE_THRESHOLD;
      rows.push({
        studentId: r.studentId,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
        classGroupName: r.enrollment.classGroup?.name ?? "—",
        riskType: isHigh ? "LOW_ATTENDANCE" : "ATTENDANCE_TREND",
        severity: isHigh ? "HIGH" : "MEDIUM",
        detail: `Presença em ${pct.toFixed(0)}%`,
      });
    }
  }

  for (const r of missingAssessments) {
    rows.push({
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      classGroupName: r.assessment.classGroup?.name ?? "—",
      riskType: "MISSING_ASSESSMENTS",
      severity: "MEDIUM",
      detail: "Avaliações em falta",
    });
  }

  const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  rows.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return rows;
}

// ── Upcoming deadlines — next 14 days, scoped to this teacher ─────────────────

const DEADLINES_WINDOW_DAYS = 14;
const DEADLINES_ROWS_PER_TYPE = 10;
/**
 * findUpcomingEventsByOrganization sorts by startDate ascending and only
 * filters endDate >= now upstream — an in-progress multi-day event (started
 * yesterday) sorts *before* genuinely future ones. Fetching a larger batch
 * here, then filtering startDate >= now locally, keeps in-progress events
 * from crowding out real future events out of a too-small `take`. Still
 * bounded (not unbounded) — the final list is sorted + capped for display
 * by the UI regardless.
 */
const ACADEMIC_EVENTS_CANDIDATE_LIMIT = DEADLINES_ROWS_PER_TYPE * 3;

export async function findTeacherUpcomingDeadlines(
  teacherId: string,
  organizationId: string
): Promise<TeacherDeadline[]> {
  const db = await getDb();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DEADLINES_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [assessments, classGroups, academicEvents] = await Promise.all([
    db.assessment.findMany({
      where: {
        teacherId,
        organizationId,
        deletedAt: null,
        status: { in: ["SCHEDULED", "OPEN"] },
        assessmentDate: { gte: now, lte: windowEnd },
      },
      select: { id: true, title: true, assessmentDate: true },
      orderBy: { assessmentDate: "asc" },
      take: DEADLINES_ROWS_PER_TYPE,
    }),
    db.classGroup.findMany({
      where: { teacherId, organizationId, deletedAt: null, status: "ACTIVE", endDate: { gte: now, lte: windowEnd } },
      select: { id: true, name: true, endDate: true },
      orderBy: { endDate: "asc" },
      take: DEADLINES_ROWS_PER_TYPE,
    }),
    findUpcomingEventsByOrganization(organizationId, ACADEMIC_EVENTS_CANDIDATE_LIMIT),
  ]);

  const deadlines: TeacherDeadline[] = [
    ...assessments.map((a) => ({
      id: a.id,
      type: "ASSESSMENT" as const,
      title: `Avaliação: ${a.title}`,
      date: a.assessmentDate,
      link: `/assessments/${a.id}`,
    })),
    ...classGroups.map((cg) => ({
      id: cg.id,
      type: "CLASS_GROUP_END" as const,
      title: `Turma "${cg.name}" termina`,
      date: cg.endDate as Date,
      link: `/class-groups/${cg.id}`,
    })),
    ...academicEvents
      // findUpcomingEventsByOrganization only enforces endDate >= now, so an
      // already-in-progress multi-day event (startDate in the past) would
      // otherwise show up as a "future" deadline — exclude those here.
      .filter((e) => e.startDate >= now && e.startDate <= windowEnd)
      .map((e) => ({
        id: e.id,
        type: "ACADEMIC_EVENT" as const,
        title: e.title,
        date: e.startDate,
        link: "/academic-calendar",
      })),
  ];

  return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
}
