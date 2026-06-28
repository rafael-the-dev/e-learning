import { getDb } from "@/server/db";
import { NotFoundError } from "@/shared/lib/command";
import { getStudent360Core, resolveCurrentEnrollmentLevel } from "@/modules/students/student-360/services/student-360.service";
import { findAttendanceRecordsByStudent } from "@/modules/students/student-360/repositories/student-360.repository";
import { getStudentDocuments } from "@/modules/student-documents/services/student-document.service";
import {
  findStudentUpcomingClasses,
  findStudentAssessments,
  findStudentPublishedGrades,
  findStudentAttendanceForStats,
  findSubjectNamesByIds,
} from "@/modules/student-portal/repositories/student-portal.repository";
import {
  buildStudentAttendanceKpis,
  buildStudentAttendanceTrend,
} from "@/modules/student-portal/services/student-portal-attendance.service";
import type {
  StudentGradeRow,
  StudentAssessmentRow,
  StudentUpcomingClass,
  StudentDocumentRow,
  StudentAttendanceKpis,
  StudentAttendanceMonthlyPoint,
  StudentAttendanceSessionRow,
} from "@/modules/student-portal/types";
import {
  findGuardianLinks,
  findGuardianLink,
  findGuardianStudentEnrollmentSummaries,
} from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import type { GuardianLinkRow } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import {
  deriveGuardianAcademicStatusLabel,
  computeGuardianOverallAverage,
  countApprovedSubjects,
  countPendingSubjects,
  countUpcomingAssessments,
} from "@/modules/guardian-portal/services/guardian-portal-academic.service";
import { buildGuardianFinanceSection } from "@/modules/guardian-portal/services/guardian-portal-finance.service";
import { getGuardianNotifications } from "@/modules/guardian-portal/services/guardian-portal-notifications.service";
import type {
  GuardianPortalData,
  GuardianStudentOption,
  GuardianSelectedStudentData,
  GuardianLinkPermissions,
} from "@/modules/guardian-portal/types";
import type { AuthContext } from "@/server/auth/context";

// =============================================================================
// GUARDIAN PORTAL — MAIN SERVICE
// Aggregates everything the portal renders for the SELECTED linked student,
// gated by the per-link visibility flags. Reuses the Student 360 aggregator and
// the Student Portal's portal-specific reads — no duplicated engines. Security
// invariants (all enforced here, never trusted from the client):
//   • guardianUserId  = context.userId
//   • organizationId  = context.organizationId
//   • selectedStudentId is validated against GuardianStudent before any read
//   • a section is fetched ONLY when its link flag allows it
// See docs/guardian-portal.md.
// =============================================================================

const UPCOMING_CLASSES_LIMIT = 20;
const ASSESSMENTS_LIMIT = 12;
const PUBLISHED_GRADES_LIMIT = 15;
const ATTENDANCE_ROWS_LIMIT = 12;
const INVOICE_ROWS_LIMIT = 10;
const PAYMENT_ROWS_LIMIT = 10;
const DOCUMENTS_LIMIT = 20;
const NOTIFICATIONS_LIMIT = 8;
const UPCOMING_WINDOW_DAYS = 7;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toPermissions(link: GuardianLinkRow): GuardianLinkPermissions {
  return {
    canViewAcademic: link.canViewAcademic,
    canViewAttendance: link.canViewAttendance,
    canViewFinance: link.canViewFinance,
    canViewDocuments: link.canViewDocuments,
    canReceiveNotifications: link.canReceiveNotifications,
  };
}

function studentDisplayName(link: GuardianLinkRow): string {
  return `${link.student.firstName} ${link.student.lastName}`.trim();
}

/**
 * Builds the full per-student payload, gated by the link's flags. studentId is
 * the validated link.studentId — never client input. Every read is wrapped so a
 * forbidden section is simply never fetched.
 */
async function buildSelectedStudentData(
  link: GuardianLinkRow,
  organizationId: string,
  guardianUnreadCount: number
): Promise<GuardianSelectedStudentData> {
  const studentId = link.studentId;
  const studentName = studentDisplayName(link);
  const permissions = toPermissions(link);

  const now = new Date();
  const windowStart = startOfDay(now);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_DAYS);

  // Backbone aggregator — student, enrollments, finance statement, wallet,
  // subject/level/course progress. Shared with Student 360 / Student Portal.
  const core = await getStudent360Core(studentId, organizationId);
  const level = resolveCurrentEnrollmentLevel(core.currentEnrollment);

  const activeClassGroupIds = unique(
    core.activeEnrollments.map((e) => e.classGroupId).filter((id): id is string => Boolean(id))
  );

  const showClasses = permissions.canViewAcademic || permissions.canViewAttendance;

  // ── Conditional reads — a forbidden section is never queried ────────────────
  const [assessmentsRaw, publishedGradesRaw, upcomingClassesRaw, attendanceStatsRaw, attendanceRecords, documentsRaw] =
    await Promise.all([
      permissions.canViewAcademic
        ? findStudentAssessments(organizationId, activeClassGroupIds, studentId, ASSESSMENTS_LIMIT)
        : Promise.resolve([]),
      permissions.canViewAcademic
        ? findStudentPublishedGrades(organizationId, studentId, PUBLISHED_GRADES_LIMIT)
        : Promise.resolve([]),
      showClasses
        ? findStudentUpcomingClasses(organizationId, activeClassGroupIds, windowStart, windowEnd, UPCOMING_CLASSES_LIMIT)
        : Promise.resolve([]),
      permissions.canViewAttendance
        ? findStudentAttendanceForStats(organizationId, studentId)
        : Promise.resolve([]),
      permissions.canViewAttendance
        ? findAttendanceRecordsByStudent(studentId, organizationId, { page: 1, pageSize: ATTENDANCE_ROWS_LIMIT })
        : Promise.resolve({ data: [] as Array<{ id: string; sessionDate: Date; subjectName: string; status: string }> }),
      permissions.canViewDocuments
        ? getStudentDocuments(studentId, organizationId)
        : Promise.resolve([]),
    ]);

  const subjectNames = await findSubjectNamesByIds(
    organizationId,
    unique([...assessmentsRaw.map((a) => a.subjectId), ...publishedGradesRaw.map((g) => g.subjectId)])
  );
  const subjectName = (id: string) => subjectNames.get(id) ?? "—";

  // ── Academic ────────────────────────────────────────────────────────────────
  const grades: StudentGradeRow[] | null = permissions.canViewAcademic
    ? publishedGradesRaw.map((g) => ({
        id: g.id,
        subjectName: subjectName(g.subjectId),
        assessmentTitle: g.assessmentTitle,
        score: g.score,
        maxScore: g.maxScore,
        percentage: g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 1000) / 10 : 0,
        status: g.status,
        publishedAt: g.publishedAt,
      }))
    : null;

  const assessments: StudentAssessmentRow[] | null = permissions.canViewAcademic
    ? assessmentsRaw.map((a) => ({
        assessmentId: a.assessmentId,
        title: a.title,
        subjectName: subjectName(a.subjectId),
        assessmentDate: a.assessmentDate,
        status: a.status,
        isPublished: a.isPublished,
        score: a.score,
        maxScore: a.maxScore,
      }))
    : null;

  // ── Attendance ──────────────────────────────────────────────────────────────
  const attendanceKpis: StudentAttendanceKpis | null = permissions.canViewAttendance
    ? buildStudentAttendanceKpis(attendanceStatsRaw)
    : null;
  const attendanceTrend: StudentAttendanceMonthlyPoint[] = permissions.canViewAttendance
    ? buildStudentAttendanceTrend(attendanceStatsRaw)
    : [];
  const attendanceSessions: StudentAttendanceSessionRow[] = permissions.canViewAttendance
    ? attendanceRecords.data.map((r) => ({
        id: r.id,
        sessionDate: r.sessionDate,
        subjectName: r.subjectName,
        status: r.status,
      }))
    : [];

  // ── Upcoming classes (academic OR attendance visibility) ────────────────────
  const upcomingClasses: StudentUpcomingClass[] = showClasses
    ? upcomingClassesRaw.map((c) => ({
        id: c.id,
        sessionDate: c.sessionDate,
        startTime: c.startTime,
        endTime: c.endTime,
        subjectName: c.subjectName,
        teacherName: c.teacherName,
        classroomName: c.classroomName,
        status: c.status,
      }))
    : [];

  // ── Finance ─────────────────────────────────────────────────────────────────
  const finance = permissions.canViewFinance
    ? buildGuardianFinanceSection(core.statement, INVOICE_ROWS_LIMIT, PAYMENT_ROWS_LIMIT)
    : null;

  // ── Documents ───────────────────────────────────────────────────────────────
  const documents: StudentDocumentRow[] | null = permissions.canViewDocuments
    ? documentsRaw.slice(0, DOCUMENTS_LIMIT).map((d) => ({
        id: d.id,
        documentType: d.documentType,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        status: d.status,
        createdAt: d.createdAt,
      }))
    : null;

  const overallAverage = grades ? computeGuardianOverallAverage(grades) : null;

  return {
    studentId,
    studentName,
    permissions,
    relationshipType: link.relationshipType,
    isPrimary: link.isPrimary,
    overview: {
      // Identity is always visible to a linked guardian.
      studentName,
      studentNumber: core.student.code ?? link.student.code,
      studentStatus: link.student.status,
      // Everything below is academic metadata — gated by canViewAcademic. When
      // academic visibility is off, course/level/class/enrollment-status/status
      // label/average are all nulled (and the academic reads above were skipped).
      enrollmentStatus: permissions.canViewAcademic ? core.currentEnrollment?.status ?? null : null,
      courseName: permissions.canViewAcademic ? core.currentEnrollment?.courseName ?? null : null,
      currentLevelName: permissions.canViewAcademic ? level.name : null,
      classGroupName: permissions.canViewAcademic ? core.currentEnrollment?.classGroupName ?? null : null,
      academicStatusLabel: permissions.canViewAcademic ? deriveGuardianAcademicStatusLabel(core) : null,
      overallAverage,
      attendancePercentage: attendanceKpis?.attendancePercentage ?? null,
    },
    kpis: {
      overallAverage: permissions.canViewAcademic ? overallAverage : null,
      approvedSubjects: permissions.canViewAcademic ? countApprovedSubjects(core) : null,
      pendingSubjects: permissions.canViewAcademic ? countPendingSubjects(core) : null,
      upcomingAssessments:
        permissions.canViewAcademic && assessments ? countUpcomingAssessments(assessments, windowStart) : null,
      averageAttendance: attendanceKpis?.attendancePercentage ?? null,
      absences: permissions.canViewAttendance ? attendanceKpis?.absentCount ?? 0 : null,
      pendingInvoices: finance ? finance.pendingInvoiceCount : null,
      outstandingBalance: finance ? finance.summary.totalDue : null,
      unreadNotifications: permissions.canReceiveNotifications ? guardianUnreadCount : null,
    },
    upcomingClasses,
    assessments,
    grades,
    attendanceKpis,
    attendanceTrend,
    attendanceSessions,
    paymentsSummary: finance ? finance.summary : null,
    invoices: finance ? finance.invoices : [],
    payments: finance ? finance.payments : [],
    documents,
  };
}

/**
 * Top-level read for the Guardian Portal. Returns the student selector, the
 * resolved/validated selected student's full payload, and the guardian's own
 * notification summary. When the guardian has no linked students, `students` is
 * empty and `selected` is null (the page renders the blocked state).
 */
export async function getGuardianPortalData(
  context: AuthContext,
  requestedStudentId?: string | null
): Promise<GuardianPortalData> {
  const { organizationId, userId: guardianUserId } = context;

  const [links, guardianUser, notifications] = await Promise.all([
    findGuardianLinks(organizationId, guardianUserId),
    resolveGuardianName(guardianUserId),
    getGuardianNotifications(organizationId, guardianUserId, NOTIFICATIONS_LIMIT),
  ]);

  if (links.length === 0) {
    return {
      guardianName: guardianUser,
      students: [],
      selectedStudentId: null,
      selected: null,
      notifications: notifications.notifications,
      unreadNotificationCount: notifications.unreadCount,
    };
  }

  // Student selector — lightweight course/class labels for every linked student.
  const enrollmentSummaries = await findGuardianStudentEnrollmentSummaries(
    organizationId,
    links.map((l) => l.studentId)
  );
  const students: GuardianStudentOption[] = links.map((l) => {
    const summary = enrollmentSummaries.get(l.studentId);
    return {
      studentId: l.studentId,
      studentName: studentDisplayName(l),
      studentNumber: l.student.code,
      // Course/class are academic metadata — only labelled for links that grant
      // academic visibility. Otherwise the selector shows name + number + status.
      courseName: l.canViewAcademic ? summary?.courseName ?? null : null,
      classGroupName: l.canViewAcademic ? summary?.classGroupName ?? null : null,
      status: l.student.status,
      relationshipType: l.relationshipType,
      isPrimary: l.isPrimary,
    };
  });

  // Validate the requested selection against the links; ignore a forged/foreign
  // studentId and fall back to the first (primary) linked student.
  let selectedLink: GuardianLinkRow | null = null;
  if (requestedStudentId) {
    selectedLink =
      links.find((l) => l.studentId === requestedStudentId) ??
      // Defensive re-check straight against the DB (handles a race where the
      // link list was built from a stale read); still scoped to this guardian.
      (await findGuardianLink(organizationId, guardianUserId, requestedStudentId));
  }

  // Build an ordered candidate list: the resolved selection first, then the
  // remaining links. We try each in turn so that a student who disappeared
  // (soft-deleted between the link read and the profile read) never breaks the
  // whole portal — we just skip them and select the next valid linked student.
  const ordered: GuardianLinkRow[] = selectedLink
    ? [selectedLink, ...links.filter((l) => l.linkId !== selectedLink!.linkId)]
    : links;

  let selected: GuardianSelectedStudentData | null = null;
  for (const candidate of ordered) {
    try {
      selected = await buildSelectedStudentData(candidate, organizationId, notifications.unreadCount);
      break;
    } catch (err) {
      // A vanished/soft-deleted student surfaces as NotFoundError from the
      // Student 360 backbone — drop that candidate and try the next. Any other
      // error is a genuine fault and must propagate.
      if (err instanceof NotFoundError) continue;
      throw err;
    }
  }

  // Every linked student disappeared → fall back to the blocked state rather
  // than rendering a half-empty portal.
  if (!selected) {
    return {
      guardianName: guardianUser,
      students: [],
      selectedStudentId: null,
      selected: null,
      notifications: notifications.notifications,
      unreadNotificationCount: notifications.unreadCount,
    };
  }

  return {
    guardianName: guardianUser,
    students,
    selectedStudentId: selected.studentId,
    selected,
    notifications: notifications.notifications,
    unreadNotificationCount: notifications.unreadCount,
  };
}

async function resolveGuardianName(guardianUserId: string): Promise<string> {
  const db = await getDb();
  const user = await db.user.findUnique({ where: { id: guardianUserId }, select: { name: true } });
  return user?.name ?? "Encarregado";
}
