import { getStudent360Core } from "@/modules/students/student-360/services/student-360.service";
import type { Student360Core } from "@/modules/students/student-360/services/student-360.service";
import { findAttendanceRecordsByStudent } from "@/modules/students/student-360/repositories/student-360.repository";
import { getStudentDocuments } from "@/modules/student-documents/services/student-document.service";
import { getUnreadCount, getLatestForUser } from "@/modules/notifications/services/notification.service";
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
  StudentPortalData,
  StudentPortalBlockedReason,
  StudentAcademicOverview,
  StudentPortalKpis,
  StudentAssessmentRow,
  StudentGradeRow,
  StudentUpcomingClass,
  StudentPaymentsSummary,
  StudentInvoiceRow,
  StudentPaymentRow,
  StudentDocumentRow,
} from "@/modules/student-portal/types";

const UPCOMING_CLASSES_LIMIT = 20;
const ASSESSMENTS_LIMIT = 12;
const PUBLISHED_GRADES_LIMIT = 15;
const ATTENDANCE_ROWS_LIMIT = 12;
const INVOICE_ROWS_LIMIT = 10;
const PAYMENT_ROWS_LIMIT = 10;
const DOCUMENTS_LIMIT = 20;
const NOTIFICATIONS_LIMIT = 8;
const UPCOMING_WINDOW_DAYS = 7;

const UNPAID_INVOICE_STATUSES = ["PENDING", "OVERDUE", "PARTIALLY_PAID"];

/**
 * Pure gate — no Student record linked, or linked to a non-ACTIVE one
 * (PENDING/SUSPENDED/COMPLETED/DROPPED). Mirrors the Teacher Portal gate.
 */
export function resolveStudentPortalBlockedReason(
  student: { status: string } | null
): StudentPortalBlockedReason | null {
  if (!student) return "NOT_LINKED";
  if (student.status !== "ACTIVE") return "INACTIVE";
  return null;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function buildAcademicOverview(core: Student360Core, studentName: string): StudentAcademicOverview {
  // Current level from the canonical academic summary (M1) — not re-resolved here.
  const level = core.academicSummary.currentLevel;
  const totalSubjects = core.subjectProgress.length;
  const passedSubjects = core.academicSummary.passedSubjects;

  return {
    studentName,
    studentNumber: core.student.code,
    enrollmentStatus: core.currentEnrollment?.status ?? null,
    courseName: core.currentEnrollment?.courseName ?? null,
    currentLevelName: level.name,
    classGroupName: core.currentEnrollment?.classGroupName ?? null,
    // Single canonical academic status label (H2) — same as Student 360 / Guardian.
    academicStatusLabel: core.academicSummary.progressionStatus,
    courseProgressPercent: totalSubjects > 0 ? Math.round((passedSubjects / totalSubjects) * 100) : null,
    hasActiveEnrollment: core.activeEnrollments.length > 0,
    blockedLevelCount: core.levelProgress.filter((p) => p.status === "BLOCKED").length,
    recoveryRequiredCount: core.levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length,
  };
}

/**
 * Aggregates everything the Student Portal renders for ONE student. studentId
 * is resolved server-side from the current user (never from a URL); this
 * function assumes the caller already validated linkage + ACTIVE status via
 * {@link resolveStudentPortalBlockedReason}. Every downstream query is scoped to
 * (organizationId, studentId) or to the student's own class groups.
 */
export async function getStudentPortalData(
  studentId: string,
  studentName: string,
  userId: string,
  organizationId: string
): Promise<StudentPortalData> {
  const now = new Date();
  const windowStart = startOfDay(now);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_DAYS);

  // Backbone: the same aggregator Student 360 uses — student, enrollments,
  // finance statement, wallet, subject/level/course progress, attendance.
  // A student always sees their OWN finance — resolve the portal policy explicitly
  // rather than a generic finance boolean (both billing and wallet are authorized).
  const core = await getStudent360Core(studentId, organizationId, {
    canViewInvoices: true,
    canViewWallet: true,
  });

  const activeClassGroupIds = unique(
    core.activeEnrollments
      .map((e) => e.classGroupId)
      .filter((id): id is string => Boolean(id))
  );

  // Portal-specific reads — all independently fetchable.
  const [
    upcomingClassesRaw,
    assessmentsRaw,
    publishedGradesRaw,
    attendanceStatsRaw,
    attendanceRecords,
    documentsRaw,
    unreadNotificationCount,
    notifications,
  ] = await Promise.all([
    findStudentUpcomingClasses(organizationId, activeClassGroupIds, windowStart, windowEnd, UPCOMING_CLASSES_LIMIT),
    findStudentAssessments(organizationId, activeClassGroupIds, studentId, ASSESSMENTS_LIMIT),
    findStudentPublishedGrades(organizationId, studentId, PUBLISHED_GRADES_LIMIT),
    findStudentAttendanceForStats(organizationId, studentId),
    findAttendanceRecordsByStudent(studentId, organizationId, { page: 1, pageSize: ATTENDANCE_ROWS_LIMIT }),
    getStudentDocuments(studentId, organizationId),
    getUnreadCount(organizationId, userId),
    getLatestForUser(organizationId, userId, NOTIFICATIONS_LIMIT),
  ]);

  // Subject-name lookup (re-asserts org) for the IDs surfaced above.
  const subjectNames = await findSubjectNamesByIds(
    organizationId,
    unique([...assessmentsRaw.map((a) => a.subjectId), ...publishedGradesRaw.map((g) => g.subjectId)])
  );
  const subjectName = (id: string) => subjectNames.get(id) ?? "—";

  const upcomingClasses: StudentUpcomingClass[] = upcomingClassesRaw.map((c) => ({
    id: c.id,
    sessionDate: c.sessionDate,
    startTime: c.startTime,
    endTime: c.endTime,
    subjectName: c.subjectName,
    teacherName: c.teacherName,
    classroomName: c.classroomName,
    status: c.status,
  }));

  const assessments: StudentAssessmentRow[] = assessmentsRaw.map((a) => ({
    assessmentId: a.assessmentId,
    title: a.title,
    subjectName: subjectName(a.subjectId),
    assessmentDate: a.assessmentDate,
    status: a.status,
    isPublished: a.isPublished,
    score: a.score,
    maxScore: a.maxScore,
  }));

  const grades: StudentGradeRow[] = publishedGradesRaw.map((g) => ({
    id: g.id,
    subjectName: subjectName(g.subjectId),
    assessmentTitle: g.assessmentTitle,
    score: g.score,
    maxScore: g.maxScore,
    percentage: g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 1000) / 10 : 0,
    status: g.status,
    publishedAt: g.publishedAt,
  }));

  // Headline attendance % comes from the canonical summary (H5) so it matches Student 360
  // and the Guardian portal exactly. The per-status count breakdown stays from the precise
  // raw records (the year-rollup can't express a precise unjustified-absence count), and
  // the monthly trend is per-month (a grain the year-rollups don't hold).
  const attendanceKpis = {
    ...buildStudentAttendanceKpis(attendanceStatsRaw),
    attendancePercentage: core.attendanceSummary.attendancePercentage,
  };
  const attendanceTrend = buildStudentAttendanceTrend(attendanceStatsRaw);
  const attendanceSessions = attendanceRecords.data.map((r) => ({
    id: r.id,
    sessionDate: r.sessionDate,
    subjectName: r.subjectName,
    status: r.status,
  }));

  // ── Finance (reused from the Student 360 billing/wallet projections) ─────────
  const billing = core.finance?.billing ?? null;
  const wallet = core.finance?.wallet ?? null;
  const invoices: StudentInvoiceRow[] = (billing?.invoices ?? [])
    .filter((inv) => UNPAID_INVOICE_STATUSES.includes(inv.status))
    .slice(0, INVOICE_ROWS_LIMIT)
    .map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
      balanceAmount: inv.balanceAmount,
      status: inv.status,
    }));

  const payments: StudentPaymentRow[] = (billing?.payments ?? [])
    .slice(0, PAYMENT_ROWS_LIMIT)
    .map((p) => ({
      paymentId: p.paymentId,
      paymentNumber: p.paymentNumber,
      paymentDate: p.paymentDate,
      totalAmount: p.totalAmount,
      status: p.status,
    }));

  const overdueAmount = (billing?.invoices ?? [])
    .filter((inv) => inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + inv.balanceAmount, 0);

  const nextDueDate = (billing?.invoices ?? [])
    .filter((inv) => UNPAID_INVOICE_STATUSES.includes(inv.status) && inv.dueDate != null)
    .map((inv) => inv.dueDate as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const paymentsSummary: StudentPaymentsSummary = {
    totalDue: billing?.outstandingBalance ?? 0,
    overdueAmount,
    nextDueDate,
    walletBalance: wallet?.walletBalance ?? 0,
  };

  const documents: StudentDocumentRow[] = documentsRaw.slice(0, DOCUMENTS_LIMIT).map((d) => ({
    id: d.id,
    documentType: d.documentType,
    fileName: d.fileName,
    fileUrl: d.fileUrl,
    status: d.status,
    createdAt: d.createdAt,
  }));

  const overview = buildAcademicOverview(core, studentName);
  const kpis = buildKpis(core, attendanceKpis.attendancePercentage, assessments, unreadNotificationCount);

  return {
    studentId,
    studentName,
    overview,
    kpis,
    upcomingClasses,
    assessments,
    grades,
    attendanceKpis,
    attendanceTrend,
    attendanceSessions,
    paymentsSummary,
    invoices,
    payments,
    notifications,
    unreadNotificationCount,
    documents,
  };
}

function buildKpis(
  core: Student360Core,
  averageAttendance: number | null,
  assessments: StudentAssessmentRow[],
  unreadNotifications: number
): StudentPortalKpis {
  // Canonical average — the same "Média das Disciplinas" Student 360 and the Guardian
  // portal show (StudentSubjectProgress.finalGrade), NOT a mean of the legacy per-
  // assessment percentages, and never a paginated slice (H2 single source of truth).
  const overallAverage = core.academicSummary.subjectAverage;

  const approvedSubjects = core.academicSummary.passedSubjects;
  const pendingSubjects = core.subjectProgress.length - approvedSubjects;
  const today = startOfDay(new Date());
  const upcomingAssessments = assessments.filter((a) => a.assessmentDate >= today).length;
  const pendingInvoices = (core.finance?.billing?.invoices ?? []).filter((inv) =>
    UNPAID_INVOICE_STATUSES.includes(inv.status)
  ).length;

  return {
    averageAttendance,
    overallAverage,
    approvedSubjects,
    pendingSubjects,
    upcomingAssessments,
    pendingInvoices,
    outstandingBalance: core.finance?.billing?.outstandingBalance ?? 0,
    unreadNotifications,
  };
}
