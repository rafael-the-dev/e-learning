import { getDb } from "@/server/db";
import { getAttendanceSessionsByOrganization } from "@/modules/attendance/services/attendance.service";
import type { TeacherScheduleRow, TeacherTimelineItem } from "@/modules/teachers/teacher-360/types";

// =============================================================================
// TEACHER 360 REPOSITORY
// All queries are scoped to organizationId + teacherId. Never query cross-tenant.
// =============================================================================

export interface TeacherCoreCounts {
  subjectCount: number;
  totalClassGroupCount: number;
  activeClassGroupCount: number;
}

export async function findTeacherCoreCounts(
  teacherId: string,
  organizationId: string
): Promise<TeacherCoreCounts> {
  const db = await getDb();
  const [subjectCount, totalClassGroupCount, activeClassGroupCount] = await Promise.all([
    db.teacherSubject.count({ where: { teacherId } }),
    db.classGroup.count({ where: { teacherId, organizationId, deletedAt: null } }),
    db.classGroup.count({
      where: { teacherId, organizationId, status: "ACTIVE", deletedAt: null },
    }),
  ]);
  return { subjectCount, totalClassGroupCount, activeClassGroupCount };
}

export interface TeacherAssessmentMetrics {
  openCount: number;
  gradedCount: number;
  publishedCount: number;
  overdueOpenCount: number;
  maxDaysOverdue: number;
  pendingGradingOpenCount: number;
  pendingGradingResultsCount: number;
  readyNotPublishedCount: number;
  upcomingCount: number;
}

export async function findTeacherAssessmentMetrics(
  teacherId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<TeacherAssessmentMetrics> {
  const db = await getDb();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    statusGroups,
    overdueAssessments,
    pendingGradingOpenCount,
    pendingGradingResultsCount,
    readyNotPublishedCount,
    upcomingCount,
    publishedCount,
  ] = await Promise.all([
    db.assessment.groupBy({
      by: ["status"],
      where: { teacherId, organizationId, deletedAt: null },
      _count: { _all: true },
    }),
    db.assessment.findMany({
      where: { teacherId, organizationId, status: "OPEN", assessmentDate: { lt: now }, deletedAt: null },
      select: { assessmentDate: true },
    }),
    db.assessment.count({
      where: {
        teacherId,
        organizationId,
        status: "OPEN",
        deletedAt: null,
        results: { some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null } },
      },
    }),
    db.assessmentResult.count({
      where: {
        organizationId,
        status: { in: ["PENDING", "SUBMITTED"] },
        deletedAt: null,
        assessment: { teacherId, deletedAt: null },
      },
    }),
    db.assessment.count({
      where: {
        teacherId,
        organizationId,
        status: "GRADED",
        deletedAt: null,
        publication: { publicationStatus: "READY" },
      },
    }),
    db.assessment.count({
      where: {
        teacherId,
        organizationId,
        status: { in: ["SCHEDULED", "OPEN"] },
        assessmentDate: { gte: now, lte: in7Days },
        deletedAt: null,
      },
    }),
    db.assessmentPublication.count({
      where: { organizationId, publicationStatus: "PUBLISHED", assessment: { teacherId } },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
  const maxDaysOverdue = overdueAssessments.reduce((max, a) => {
    const days = Math.floor((now.getTime() - new Date(a.assessmentDate).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(max, days);
  }, 0);

  return {
    openCount: byStatus["OPEN"] ?? 0,
    gradedCount: byStatus["GRADED"] ?? 0,
    publishedCount,
    overdueOpenCount: overdueAssessments.length,
    maxDaysOverdue,
    pendingGradingOpenCount,
    pendingGradingResultsCount,
    readyNotPublishedCount,
    upcomingCount,
  };
}

export interface TeacherAttendanceExecution {
  completedSessionsLast30d: number;
  completedSessionsWithRecordsLast30d: number;
}

export async function findTeacherAttendanceExecution(
  teacherId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<TeacherAttendanceExecution> {
  const db = await getDb();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [completedSessionsLast30d, completedSessionsWithRecordsLast30d] = await Promise.all([
    db.attendanceSession.count({
      where: { teacherId, organizationId, status: "COMPLETED", sessionDate: { gte: since, lte: now } },
    }),
    db.attendanceSession.count({
      where: {
        teacherId,
        organizationId,
        status: "COMPLETED",
        sessionDate: { gte: since, lte: now },
        records: { some: { deletedAt: null } },
      },
    }),
  ]);

  return { completedSessionsLast30d, completedSessionsWithRecordsLast30d };
}

export async function findTaughtLevelSubjectIds(
  teacherId: string,
  organizationId: string
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.assessment.findMany({
    where: { teacherId, organizationId, deletedAt: null },
    select: { levelSubjectId: true },
    distinct: ["levelSubjectId"],
  });
  return rows.map((r) => r.levelSubjectId);
}

export interface TeacherQualityRaw {
  passedCount: number;
  failedCount: number;
  avgAttendance: number | null;
  avgFinalGrade: number | null;
}

export async function findTeacherQualityRaw(
  levelSubjectIds: string[],
  organizationId: string
): Promise<TeacherQualityRaw> {
  if (levelSubjectIds.length === 0) {
    return { passedCount: 0, failedCount: 0, avgAttendance: null, avgFinalGrade: null };
  }

  const db = await getDb();
  const [statusGroups, aggregates] = await Promise.all([
    db.studentSubjectProgress.groupBy({
      by: ["status"],
      where: { organizationId, levelSubjectId: { in: levelSubjectIds } },
      _count: { _all: true },
    }),
    db.studentSubjectProgress.aggregate({
      where: { organizationId, levelSubjectId: { in: levelSubjectIds } },
      _avg: { attendancePercentage: true, finalGrade: true },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

  return {
    passedCount: byStatus["PASSED"] ?? 0,
    failedCount: byStatus["FAILED"] ?? 0,
    avgAttendance:
      aggregates._avg.attendancePercentage != null ? Number(aggregates._avg.attendancePercentage) : null,
    avgFinalGrade: aggregates._avg.finalGrade != null ? Number(aggregates._avg.finalGrade) : null,
  };
}

export interface TeacherWorkloadMetrics {
  activeClassGroupIds: string[];
  distinctActiveStudentCount: number;
  weeklyHours: number;
  // SUM(currentCount) / SUM(capacity) across every ACTIVE class group — never
  // derived from a paginated page, so it cannot change when the user pages
  // through the Class Groups tab.
  avgOccupancyPercent: number;
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export async function findTeacherWorkloadMetrics(
  teacherId: string,
  organizationId: string
): Promise<TeacherWorkloadMetrics> {
  const db = await getDb();
  const activeGroups = await db.classGroup.findMany({
    where: { teacherId, organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, capacity: true, currentCount: true },
  });
  const activeClassGroupIds = activeGroups.map((g) => g.id);

  if (activeClassGroupIds.length === 0) {
    return { activeClassGroupIds: [], distinctActiveStudentCount: 0, weeklyHours: 0, avgOccupancyPercent: 0 };
  }

  const [enrollments, schedules] = await Promise.all([
    db.enrollment.findMany({
      where: { organizationId, classGroupId: { in: activeClassGroupIds }, status: "ACTIVE" },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.classGroupSchedule.findMany({
      where: { organizationId, classGroupId: { in: activeClassGroupIds }, status: "ACTIVE", deletedAt: null },
      select: { scheduleSlot: { select: { startTime: true, endTime: true } } },
    }),
  ]);

  const totalMinutes = schedules.reduce((sum, s) => {
    return sum + Math.max(0, parseMinutes(s.scheduleSlot.endTime) - parseMinutes(s.scheduleSlot.startTime));
  }, 0);

  const totalCapacity = activeGroups.reduce((sum, g) => sum + g.capacity, 0);
  const totalCurrentCount = activeGroups.reduce((sum, g) => sum + g.currentCount, 0);

  return {
    activeClassGroupIds,
    distinctActiveStudentCount: enrollments.length,
    weeklyHours: Math.round((totalMinutes / 60) * 10) / 10,
    avgOccupancyPercent: totalCapacity > 0 ? Math.round((totalCurrentCount / totalCapacity) * 100) : 0,
  };
}

export async function findTeacherScheduleRows(
  teacherId: string,
  organizationId: string
): Promise<TeacherScheduleRow[]> {
  const db = await getDb();

  const [activeGroups, teacherSubjects] = await Promise.all([
    db.classGroup.findMany({
      where: { teacherId, organizationId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        name: true,
        courseId: true,
        courseLevelId: true,
        course: { select: { name: true } },
        courseLevel: { select: { name: true } },
      },
    }),
    db.teacherSubject.findMany({ where: { teacherId }, select: { subjectId: true } }),
  ]);

  if (activeGroups.length === 0) return [];

  const teacherSubjectIds = teacherSubjects.map((ts) => ts.subjectId);
  const courseLevelPairs = activeGroups
    .filter((g) => g.courseLevelId)
    .map((g) => ({ courseId: g.courseId, courseLevelId: g.courseLevelId as string }));

  // Approximation: ClassGroupSchedule carries no direct subject FK — resolve the
  // teacher's subjects that belong to each class group's course+level via LevelSubject.
  // Documented limitation: if the teacher teaches multiple subjects in the same
  // course/level, all are listed together (cannot disambiguate by time slot).
  const levelSubjects =
    teacherSubjectIds.length > 0 && courseLevelPairs.length > 0
      ? await db.levelSubject.findMany({
          where: {
            organizationId,
            subjectId: { in: teacherSubjectIds },
            status: "ACTIVE",
            OR: courseLevelPairs.map((p) => ({ courseId: p.courseId, courseLevelId: p.courseLevelId })),
          },
          select: { courseId: true, courseLevelId: true, subject: { select: { name: true } } },
        })
      : [];

  const subjectsByCourseLevel = new Map<string, string[]>();
  for (const ls of levelSubjects) {
    const key = `${ls.courseId}:${ls.courseLevelId}`;
    if (!subjectsByCourseLevel.has(key)) subjectsByCourseLevel.set(key, []);
    subjectsByCourseLevel.get(key)!.push(ls.subject.name);
  }

  const groupIds = activeGroups.map((g) => g.id);
  const schedules = await db.classGroupSchedule.findMany({
    where: { organizationId, classGroupId: { in: groupIds }, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      classGroupId: true,
      scheduleSlot: { select: { dayOfWeek: true, startTime: true, endTime: true } },
    },
  });

  const groupMap = new Map(activeGroups.map((g) => [g.id, g]));

  return schedules.map((s) => {
    const group = groupMap.get(s.classGroupId)!;
    const key = `${group.courseId}:${group.courseLevelId}`;
    return {
      id: s.id,
      dayOfWeek: s.scheduleSlot.dayOfWeek,
      startTime: s.scheduleSlot.startTime,
      endTime: s.scheduleSlot.endTime,
      classGroupId: group.id,
      classGroupName: group.name,
      courseName: group.course.name,
      courseLevelName: group.courseLevel?.name ?? null,
      subjectNames: subjectsByCourseLevel.get(key) ?? [],
    };
  });
}

// ── Synthesized timeline (read-time merge, not event-sourced — see docs/teacher-360.md) ──

const TIMELINE_SOURCE_LIMIT = 100;

export async function findTeacherTimelineFeed(
  teacherId: string,
  organizationId: string,
  page: number,
  pageSize: number
): Promise<{ items: TeacherTimelineItem[]; total: number }> {
  const db = await getDb();
  const teacher = await db.teacher.findFirst({
    where: { id: teacherId, organizationId },
    select: { createdAt: true },
  });

  const [
    subjectAssignments,
    classGroupAssignments,
    assessmentsCreated,
    assessmentsPublished,
    sessionsCompleted,
    documentsUploaded,
    subjectAssignmentsTotal,
    classGroupAssignmentsTotal,
    assessmentsCreatedTotal,
    assessmentsPublishedTotal,
    sessionsCompletedTotal,
    documentsUploadedTotal,
  ] = await Promise.all([
    db.teacherSubject.findMany({
      where: { teacherId },
      select: { id: true, assignedAt: true, subject: { select: { name: true } } },
      orderBy: { assignedAt: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.classGroup.findMany({
      where: { teacherId, organizationId, deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.assessment.findMany({
      where: { teacherId, organizationId, deletedAt: null },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.assessmentPublication.findMany({
      where: { organizationId, publicationStatus: "PUBLISHED", assessment: { teacherId } },
      select: { id: true, publishedAt: true, assessment: { select: { title: true } } },
      orderBy: { publishedAt: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.attendanceSession.findMany({
      where: { teacherId, organizationId, status: "COMPLETED" },
      select: {
        id: true,
        sessionDate: true,
        subject: { select: { name: true } },
        classGroup: { select: { name: true } },
      },
      orderBy: { sessionDate: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.teacherDocument.findMany({
      where: { teacherId, organizationId, deletedAt: null },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: TIMELINE_SOURCE_LIMIT,
    }),
    db.teacherSubject.count({ where: { teacherId } }),
    db.classGroup.count({ where: { teacherId, organizationId, deletedAt: null } }),
    db.assessment.count({ where: { teacherId, organizationId, deletedAt: null } }),
    db.assessmentPublication.count({
      where: { organizationId, publicationStatus: "PUBLISHED", assessment: { teacherId } },
    }),
    db.attendanceSession.count({ where: { teacherId, organizationId, status: "COMPLETED" } }),
    db.teacherDocument.count({ where: { teacherId, organizationId, deletedAt: null } }),
  ]);

  const items: TeacherTimelineItem[] = [];

  if (teacher) {
    items.push({
      id: `teacher-created-${teacherId}`,
      eventType: "TEACHER_CREATED",
      title: "Professor criado",
      description: null,
      occurredAt: teacher.createdAt,
    });
  }
  for (const ts of subjectAssignments) {
    items.push({
      id: `subject-${ts.id}`,
      eventType: "SUBJECT_ASSIGNED",
      title: `Disciplina atribuída: ${ts.subject.name}`,
      description: null,
      occurredAt: ts.assignedAt,
    });
  }
  for (const cg of classGroupAssignments) {
    items.push({
      id: `classgroup-${cg.id}`,
      eventType: "CLASS_GROUP_ASSIGNED",
      title: `Turma atribuída: ${cg.name}`,
      description: null,
      occurredAt: cg.createdAt,
    });
  }
  for (const a of assessmentsCreated) {
    items.push({
      id: `assessment-${a.id}`,
      eventType: "ASSESSMENT_CREATED",
      title: `Avaliação criada: ${a.title}`,
      description: null,
      occurredAt: a.createdAt,
    });
  }
  for (const p of assessmentsPublished) {
    if (!p.publishedAt) continue;
    items.push({
      id: `publication-${p.id}`,
      eventType: "ASSESSMENT_PUBLISHED",
      title: `Avaliação publicada: ${p.assessment.title}`,
      description: null,
      occurredAt: p.publishedAt,
    });
  }
  for (const s of sessionsCompleted) {
    items.push({
      id: `session-${s.id}`,
      eventType: "ATTENDANCE_RECORDED",
      title: `Presenças registadas: ${s.subject.name} — ${s.classGroup.name}`,
      description: null,
      occurredAt: s.sessionDate,
    });
  }
  for (const d of documentsUploaded) {
    items.push({
      id: `document-${d.id}`,
      eventType: "DOCUMENT_UPLOADED",
      title: `Documento carregado: ${d.name}`,
      description: null,
      occurredAt: d.createdAt,
    });
  }

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const total =
    1 +
    subjectAssignmentsTotal +
    classGroupAssignmentsTotal +
    assessmentsCreatedTotal +
    assessmentsPublishedTotal +
    sessionsCompletedTotal +
    documentsUploadedTotal;

  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total };
}

// ── Attendance tab ────────────────────────────────────────────────────────────

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface TeacherAttendanceKPIs {
  sessionCount: number;
  recordCount: number;
  absenceCount: number;
  avgAttendanceRate: number | null;
}

export async function findTeacherAttendanceKPIs(
  teacherId: string,
  organizationId: string
): Promise<TeacherAttendanceKPIs> {
  const db = await getDb();
  const [sessionCount, statusGroups] = await Promise.all([
    db.attendanceSession.count({ where: { teacherId, organizationId, status: "COMPLETED" } }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { organizationId, deletedAt: null, attendanceSession: { teacherId, status: "COMPLETED" } },
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
  const recordCount = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const presentCount = (byStatus["PRESENT"] ?? 0) + (byStatus["LATE"] ?? 0) + (byStatus["REMOTE"] ?? 0);
  const absenceCount = byStatus["ABSENT"] ?? 0;

  return {
    sessionCount,
    recordCount,
    absenceCount,
    avgAttendanceRate: recordCount > 0 ? Math.round((presentCount / recordCount) * 1000) / 10 : null,
  };
}

export interface TeacherAttendanceMonthPoint {
  month: string;
  attendanceRate: number | null;
}

export async function findTeacherAttendanceMonthlyTrend(
  teacherId: string,
  organizationId: string
): Promise<TeacherAttendanceMonthPoint[]> {
  const db = await getDb();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const records = await db.attendanceRecord.findMany({
    where: {
      organizationId,
      deletedAt: null,
      attendanceSession: { teacherId, status: "COMPLETED", sessionDate: { gte: sixMonthsAgo } },
    },
    select: { status: true, attendanceSession: { select: { sessionDate: true } } },
  });

  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const inMonth = records.filter((r) => {
      const sd = new Date(r.attendanceSession.sessionDate);
      return sd.getFullYear() === year && sd.getMonth() === month;
    });
    const present = inMonth.filter((r) => r.status === "PRESENT" || r.status === "LATE" || r.status === "REMOTE").length;
    return {
      month: PT_MONTHS[month],
      attendanceRate: inMonth.length > 0 ? Math.round((present / inMonth.length) * 1000) / 10 : null,
    };
  });
}

export interface TeacherAttendanceSessionRow {
  id: string;
  sessionDate: Date;
  classGroupName: string;
  subjectName: string;
  status: string;
  presentCount: number;
  absentCount: number;
  attendanceRate: number | null;
}

export async function findTeacherAttendanceSessionRows(
  teacherId: string,
  organizationId: string,
  page: number,
  pageSize: number
): Promise<{ data: TeacherAttendanceSessionRow[]; total: number }> {
  // Reuse the existing, already teacherId-aware attendance session listing
  // instead of duplicating the query — only the per-session presence/absence
  // enrichment below is unique to Teacher 360.
  const { data: sessions, total } = await getAttendanceSessionsByOrganization(organizationId, {
    teacherId,
    status: "COMPLETED",
    page,
    pageSize,
  });

  if (sessions.length === 0) return { data: [], total };

  const db = await getDb();
  const sessionIds = sessions.map((s) => s.id);
  const recordGroups = await db.attendanceRecord.groupBy({
    by: ["attendanceSessionId", "status"],
    where: { organizationId, attendanceSessionId: { in: sessionIds }, deletedAt: null },
    _count: { _all: true },
  });

  const countsBySession = new Map<string, Record<string, number>>();
  for (const g of recordGroups) {
    if (!countsBySession.has(g.attendanceSessionId)) countsBySession.set(g.attendanceSessionId, {});
    countsBySession.get(g.attendanceSessionId)![g.status] = g._count._all;
  }

  const data: TeacherAttendanceSessionRow[] = sessions.map((s) => {
    const counts = countsBySession.get(s.id) ?? {};
    const presentCount = (counts["PRESENT"] ?? 0) + (counts["LATE"] ?? 0) + (counts["REMOTE"] ?? 0);
    const absentCount = counts["ABSENT"] ?? 0;
    const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      id: s.id,
      sessionDate: s.sessionDate,
      classGroupName: s.classGroup?.name ?? "—",
      subjectName: s.subject?.name ?? "—",
      status: "COMPLETED",
      presentCount,
      absentCount,
      attendanceRate: totalRecords > 0 ? Math.round((presentCount / totalRecords) * 1000) / 10 : null,
    };
  });

  return { data, total };
}

// ── Performance tab ───────────────────────────────────────────────────────────

export interface SubjectPassRateRow {
  levelSubjectId: string;
  subjectName: string;
  passedCount: number;
  failedCount: number;
  passRate: number | null;
}

export async function findTeacherSubjectPassRates(
  levelSubjectIds: string[],
  organizationId: string
): Promise<SubjectPassRateRow[]> {
  if (levelSubjectIds.length === 0) return [];
  const db = await getDb();

  const [groups, levelSubjects] = await Promise.all([
    db.studentSubjectProgress.groupBy({
      by: ["levelSubjectId", "status"],
      where: { organizationId, levelSubjectId: { in: levelSubjectIds } },
      _count: { _all: true },
    }),
    db.levelSubject.findMany({
      where: { organizationId, id: { in: levelSubjectIds } },
      select: { id: true, subject: { select: { name: true } } },
    }),
  ]);

  const nameMap = new Map(levelSubjects.map((ls) => [ls.id, ls.subject.name]));
  const byLevelSubject = new Map<string, Record<string, number>>();
  for (const g of groups) {
    if (!byLevelSubject.has(g.levelSubjectId)) byLevelSubject.set(g.levelSubjectId, {});
    byLevelSubject.get(g.levelSubjectId)![g.status] = g._count._all;
  }

  return levelSubjectIds.map((id) => {
    const counts = byLevelSubject.get(id) ?? {};
    const passedCount = counts["PASSED"] ?? 0;
    const failedCount = counts["FAILED"] ?? 0;
    const denominator = passedCount + failedCount;
    return {
      levelSubjectId: id,
      subjectName: nameMap.get(id) ?? "Desconhecida",
      passedCount,
      failedCount,
      passRate: denominator > 0 ? Math.round((passedCount / denominator) * 100) : null,
    };
  });
}

export interface GradeMonthPoint {
  month: string;
  avgGrade: number | null;
}

export async function findTeacherGradeTrend(
  levelSubjectIds: string[],
  organizationId: string
): Promise<GradeMonthPoint[]> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  if (levelSubjectIds.length === 0) {
    return Array.from({ length: 6 }, (_, i) => ({
      month: PT_MONTHS[new Date(now.getFullYear(), now.getMonth() - (5 - i), 1).getMonth()],
      avgGrade: null,
    }));
  }

  const db = await getDb();
  const rows = await db.studentSubjectProgress.findMany({
    where: {
      organizationId,
      levelSubjectId: { in: levelSubjectIds },
      finalGrade: { not: null },
      OR: [{ completedAt: { gte: sixMonthsAgo } }, { completedAt: null, updatedAt: { gte: sixMonthsAgo } }],
    },
    select: { finalGrade: true, completedAt: true, updatedAt: true },
  });

  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const inMonth = rows.filter((r) => {
      const dt = new Date(r.completedAt ?? r.updatedAt);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
    const grades = inMonth.map((r) => Number(r.finalGrade));
    return {
      month: PT_MONTHS[month],
      avgGrade: grades.length > 0 ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null,
    };
  });
}

export async function findOrganizationAveragePassRate(organizationId: string): Promise<number | null> {
  const db = await getDb();
  const groups = await db.studentSubjectProgress.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  const passedCount = byStatus["PASSED"] ?? 0;
  const failedCount = byStatus["FAILED"] ?? 0;
  const denominator = passedCount + failedCount;
  return denominator > 0 ? Math.round((passedCount / denominator) * 100) : null;
}

// ── Subjects tab ───────────────────────────────────────────────────────────────

export interface TeacherSubjectTabRow {
  subjectId: string;
  classGroupCount: number;
  studentCount: number;
  workloadHours: number | null;
}

/**
 * TeacherSubject carries no direct course/level link — a Subject can be taught
 * across multiple courses via LevelSubject. Approximation, documented in
 * docs/teacher-360.md: a class group "counts" for a subject if that subject is
 * linked (via LevelSubject) to the class group's course+level.
 */
export async function findTeacherSubjectsTabRows(
  teacherId: string,
  organizationId: string,
  subjectIds: string[]
): Promise<TeacherSubjectTabRow[]> {
  if (subjectIds.length === 0) return [];
  const db = await getDb();

  const activeGroups = await db.classGroup.findMany({
    where: { teacherId, organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, courseId: true, courseLevelId: true, currentCount: true },
  });

  if (activeGroups.length === 0) {
    return subjectIds.map((subjectId) => ({ subjectId, classGroupCount: 0, studentCount: 0, workloadHours: null }));
  }

  const courseLevelPairs = activeGroups
    .filter((g) => g.courseLevelId)
    .map((g) => ({ courseId: g.courseId, courseLevelId: g.courseLevelId as string }));

  const levelSubjects =
    courseLevelPairs.length > 0
      ? await db.levelSubject.findMany({
          where: {
            organizationId,
            subjectId: { in: subjectIds },
            status: "ACTIVE",
            OR: courseLevelPairs.map((p) => ({ courseId: p.courseId, courseLevelId: p.courseLevelId })),
          },
          select: { subjectId: true, courseId: true, courseLevelId: true, workloadHours: true },
        })
      : [];

  return subjectIds.map((subjectId) => {
    const matches = levelSubjects.filter((ls) => ls.subjectId === subjectId);
    const matchedKeys = new Set(matches.map((m) => `${m.courseId}:${m.courseLevelId}`));
    const matchedGroups = activeGroups.filter((g) => matchedKeys.has(`${g.courseId}:${g.courseLevelId}`));
    const workloadHours = matches.find((m) => m.workloadHours != null)?.workloadHours ?? null;

    return {
      subjectId,
      classGroupCount: matchedGroups.length,
      studentCount: matchedGroups.reduce((sum, g) => sum + g.currentCount, 0),
      workloadHours,
    };
  });
}
