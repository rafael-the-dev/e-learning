import { getStudentById } from "@/modules/students/services/student.service";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import { getStudentFinancialStatement } from "@/modules/reports/finance/services/financial-reports.service";
import { findProgressByOrganization } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { calculateEnrollmentAttendanceSummary } from "@/modules/attendance/services/attendance-calculator.service";
import { findJustificationsByOrganization } from "@/modules/attendance/repositories/attendance-justification.repository";
import { findStudentAssessmentResults } from "@/modules/grades/repositories/student-assessment-result.repository";
import { getRecentTimelineEvents, getStudentTimeline } from "@/modules/student-timeline/services/student-timeline.service";
import { getStudentDocuments, getStudentDocumentCount } from "@/modules/student-documents/services/student-document.service";
import { getLevelSubjectsByLevel } from "@/modules/courses/services/course.service";
import { evaluateEligibilityForAllSubjects } from "@/modules/prerequisites/engines/subject-eligibility.engine";
import { getWalletByStudentId, getRecentTransactions } from "@/modules/wallets/services/wallet.service";
import {
  findAttendanceRecordsByStudent,
  findLevelProgressByStudent,
  findCourseProgressByStudent,
  findLastActivityAt,
} from "@/modules/students/student-360/repositories/student-360.repository";
import type {
  HealthScoreInput,
  StudentAlertsInput,
  StudentSummaryCards,
} from "@/modules/students/student-360/types";
import type { Student } from "@/modules/students/types";
import type { Enrollment } from "@/modules/enrollments/types";
import type { StudentFinancialStatement } from "@/modules/reports/finance/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";
import type { StudentLevelProgress, StudentCourseProgress, SubjectEligibilityResult } from "@/modules/prerequisites/types";
import type { StudentSubjectAttendance } from "@/modules/attendance/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";
import type { LevelSubject } from "@/modules/courses/types";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

export interface Student360Core {
  student: Student;
  enrollments: Enrollment[];
  activeEnrollments: Enrollment[];
  currentEnrollment: Enrollment | null;
  statement: StudentFinancialStatement | null;
  wallet: StudentWallet | null;
  recentWalletTransactions: WalletTransaction[];
  subjectProgress: StudentSubjectProgress[];
  levelProgress: StudentLevelProgress[];
  courseProgress: StudentCourseProgress[];
  attendanceSubjects: StudentSubjectAttendance[];
  lastActivityAt: Date | null;
  recentTimeline: StudentTimelineEvent[];
  documentCount: number;
  pendingJustificationCount: number;
}

export async function getStudent360Core(
  studentId: string,
  organizationId: string
): Promise<Student360Core> {
  const student = await getStudentById(studentId, organizationId);

  const [
    enrollmentsResult,
    statement,
    subjectProgressResult,
    levelProgress,
    courseProgress,
    lastActivityAt,
    recentTimeline,
    documentCount,
    justificationsResult,
    wallet,
  ] = await Promise.all([
    getEnrollmentsByOrganization(organizationId, { studentId, page: 1, pageSize: 50 }),
    getStudentFinancialStatement({ organizationId, studentId }),
    findProgressByOrganization(organizationId, { studentId, page: 1, pageSize: 200 }),
    findLevelProgressByStudent(studentId, organizationId),
    findCourseProgressByStudent(studentId, organizationId),
    findLastActivityAt(studentId, organizationId),
    getRecentTimelineEvents(studentId, organizationId, 5),
    getStudentDocumentCount(studentId, organizationId),
    findJustificationsByOrganization(organizationId, { studentId, status: "PENDING", page: 1, pageSize: 1 }),
    getWalletByStudentId(studentId, organizationId),
  ]);

  const recentWalletTransactions = wallet
    ? await getRecentTransactions(wallet.id, organizationId, 3)
    : [];

  const enrollments = enrollmentsResult.data;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");

  const attendanceByEnrollment = await Promise.all(
    activeEnrollments
      .filter((e) => e.classGroupId)
      .map((e) =>
        calculateEnrollmentAttendanceSummary(studentId, e.id, e.classGroupId as string, organizationId).catch(
          () => [] as StudentSubjectAttendance[]
        )
      )
  );
  const attendanceSubjects = attendanceByEnrollment.flat();

  const currentEnrollment = activeEnrollments[0] ?? enrollments[0] ?? null;

  return {
    student,
    enrollments,
    activeEnrollments,
    currentEnrollment,
    statement,
    wallet,
    recentWalletTransactions,
    subjectProgress: subjectProgressResult.data,
    levelProgress,
    courseProgress,
    attendanceSubjects,
    lastActivityAt,
    recentTimeline,
    documentCount,
    pendingJustificationCount: justificationsResult.total,
  };
}

export function buildHealthScoreInput(core: Student360Core): HealthScoreInput {
  return {
    subjectStatuses: core.subjectProgress.map((p) => p.status),
    levelStatuses: core.levelProgress.map((p) => p.status),
    outstandingBalance: core.statement?.kpis.outstandingBalance ?? 0,
    hasOverdueInvoice: core.statement?.invoices.some((i) => i.status === "OVERDUE") ?? false,
    attendancePercentages: core.attendanceSubjects.map((s) => s.attendancePercentage),
    hasBelowRequiredAttendance: core.attendanceSubjects.some((s) => s.status === "BELOW_REQUIRED"),
    enrollmentStatuses: core.enrollments.map((e) => e.status),
    lastActivityAt: core.lastActivityAt,
  };
}

export function buildAlertsInput(core: Student360Core): StudentAlertsInput {
  const pendingRefundCount =
    core.statement?.refunds.filter((r) => r.status === "REQUESTED" || r.status === "APPROVED").length ?? 0;

  return {
    blockedLevelCount: core.levelProgress.filter((p) => p.status === "BLOCKED").length,
    recoveryRequiredCount: core.levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length,
    failedSubjectCount: core.subjectProgress.filter((p) => p.status === "FAILED").length,
    outstandingBalance: core.statement?.kpis.outstandingBalance ?? 0,
    overdueInvoiceCount: core.statement?.invoices.filter((i) => i.status === "OVERDUE").length ?? 0,
    belowRequiredAttendanceSubjects: core.attendanceSubjects
      .filter((s) => s.status === "BELOW_REQUIRED")
      .map((s) => ({ subjectName: s.subjectName, attendancePercentage: s.attendancePercentage })),
    pendingRefundCount,
    pendingJustificationCount: core.pendingJustificationCount,
    documentCount: core.documentCount,
    incompleteAssessmentCount: core.subjectProgress.filter((p) => p.status === "INCOMPLETE").length,
    hasActiveEnrollment: core.activeEnrollments.length > 0,
    hasAnyEnrollment: core.enrollments.length > 0,
  };
}

function deriveAcademicStatusLabel(core: Student360Core): string {
  if (core.levelProgress.some((p) => p.status === "BLOCKED")) return "Bloqueado";
  if (core.levelProgress.some((p) => p.status === "RECOVERY_REQUIRED")) return "Em Recuperação";
  if (core.subjectProgress.some((p) => p.status === "FAILED")) return "Risco Académico";
  if (core.subjectProgress.some((p) => p.status === "IN_PROGRESS")) return "Em Curso";
  return "Regular";
}

export function buildSummaryCards(core: Student360Core, openAlertsCount: number): StudentSummaryCards {
  const gradedSubjects = core.subjectProgress.filter((p) => p.finalGrade != null);
  const finalAverage =
    gradedSubjects.length > 0
      ? gradedSubjects.reduce((sum, p) => sum + (p.finalGrade ?? 0), 0) / gradedSubjects.length
      : null;
  const attendancePercentage =
    core.attendanceSubjects.length > 0
      ? core.attendanceSubjects.reduce((sum, s) => sum + s.attendancePercentage, 0) / core.attendanceSubjects.length
      : null;

  return {
    activeEnrollments: core.activeEnrollments.length,
    currentCourseName: core.currentEnrollment?.courseName ?? null,
    academicStatusLabel: deriveAcademicStatusLabel(core),
    attendancePercentage,
    finalAverage,
    outstandingBalance: core.statement?.kpis.outstandingBalance ?? 0,
    walletBalance: core.statement?.kpis.walletBalance ?? 0,
    openAlertsCount,
  };
}

export async function getAttendanceTabData(
  studentId: string,
  organizationId: string,
  page = 1,
  pageSize = 10
) {
  const [records, justifications] = await Promise.all([
    findAttendanceRecordsByStudent(studentId, organizationId, { page, pageSize }),
    findJustificationsByOrganization(organizationId, { studentId, page: 1, pageSize: 20 }),
  ]);
  return { records, justifications };
}

export async function getGradesTabData(
  studentId: string,
  organizationId: string,
  page = 1,
  pageSize = 10
) {
  const assessments = await findStudentAssessmentResults(organizationId, { studentId, page, pageSize });
  return { assessments };
}

export interface SubjectEligibilityRow {
  levelSubject: LevelSubject;
  eligibility: SubjectEligibilityResult;
}

export interface ResolvedEnrollmentLevel {
  id: string | null;
  name: string | null;
}

// level-progression.engine.ts only ever writes currentLevelId on promotion — courseLevelId
// stays frozen at the original enrollment level. currentLevelId is the source of truth
// whenever it's set; courseLevelId is the fallback for a student who hasn't progressed yet.
export function resolveCurrentEnrollmentLevel(enrollment: Enrollment | null): ResolvedEnrollmentLevel {
  if (!enrollment) return { id: null, name: null };
  return {
    id: enrollment.currentLevelId ?? enrollment.courseLevelId ?? null,
    name: enrollment.currentLevelName ?? enrollment.courseLevelName ?? null,
  };
}

export async function getProgressTabData(
  organizationId: string,
  currentEnrollment: Enrollment | null
): Promise<{ levelSubjects: LevelSubject[]; eligibility: SubjectEligibilityRow[] }> {
  const resolvedLevelId = resolveCurrentEnrollmentLevel(currentEnrollment).id;
  if (!currentEnrollment || !resolvedLevelId) {
    return { levelSubjects: [], eligibility: [] };
  }

  const [levelSubjects, eligibilityMap] = await Promise.all([
    getLevelSubjectsByLevel(resolvedLevelId, organizationId),
    evaluateEligibilityForAllSubjects(currentEnrollment.id, organizationId),
  ]);

  // evaluateEligibilityForAllSubjects only evaluates ACTIVE level-subjects of the
  // resolved level — filter the display list to match so every row has a real result.
  const activeLevelSubjects = levelSubjects.filter((ls) => ls.status === "ACTIVE");
  const eligibility: SubjectEligibilityRow[] = activeLevelSubjects.map((levelSubject) => ({
    levelSubject,
    eligibility:
      eligibilityMap.get(levelSubject.id) ?? {
        status: SUBJECT_ELIGIBILITY_STATUS.BLOCKED,
        levelSubjectId: levelSubject.id,
        missingPrerequisites: [],
        isEligible: false,
      },
  }));

  return { levelSubjects: activeLevelSubjects, eligibility };
}

export async function getDocumentsTabData(studentId: string, organizationId: string) {
  return getStudentDocuments(studentId, organizationId);
}

export async function getTimelineTabData(
  studentId: string,
  organizationId: string,
  page = 1,
  pageSize = 20
) {
  return getStudentTimeline(studentId, organizationId, { page, pageSize });
}
