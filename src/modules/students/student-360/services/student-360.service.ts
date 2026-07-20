import { getStudentById } from "@/modules/students/services/student.service";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import { getStudentFinancialStatement } from "@/modules/reports/finance/services/financial-reports.service";
import { findProgressByOrganization } from "@/modules/assessments/repositories/student-subject-progress.repository";
import {
  getStudentSubjectAttendanceViews,
  getStudentAttendanceSummary,
} from "@/modules/attendance/services/attendance-read-model.service";
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
import {
  buildStudentAcademicSummary,
  type StudentAcademicSummary,
} from "@/modules/students/services/student-academic-summary.service";
import {
  buildStudentRiskSummary,
  type StudentRiskSummary,
  type StudentRiskInput,
} from "@/modules/students/services/student-risk.service";
import type {
  HealthScoreInput,
  Student360Capabilities,
  StudentAlert,
  StudentSummaryCards,
} from "@/modules/students/student-360/types";
import type { Student } from "@/modules/students/types";
import type { Enrollment } from "@/modules/enrollments/types";
import type { StudentFinancialStatement } from "@/modules/reports/finance/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";
import type { StudentLevelProgress, StudentCourseProgress, SubjectEligibilityResult } from "@/modules/prerequisites/types";
import type { SubjectAttendanceView, StudentAttendanceSummary } from "@/modules/attendance/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";
import type { LevelSubject } from "@/modules/courses/types";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

// Finance is split into two independently-authorized halves. Each is a PROJECTION of
// the source data carrying only its own fields — a billing-only viewer never receives
// wallet figures in the payload, and vice-versa (no masking, no over-serialization).

// Billing (INVOICES_VIEW): invoices / payments / receipts + billing KPIs.
export interface Student360BillingSummary {
  invoices: StudentFinancialStatement["invoices"];
  payments: StudentFinancialStatement["payments"];
  receipts: StudentFinancialStatement["receipts"];
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
}

// Wallet (WALLETS_VIEW): saldo / crédito / movimentos / reembolsos.
export interface Student360WalletSummary {
  wallet: StudentWallet | null;
  recentTransactions: WalletTransaction[];
  walletBalance: number;
  creditApplied: number;
  totalRefunded: number;
  refunds: StudentFinancialStatement["refunds"];
}

// Finance section — `billing`/`wallet` are each null unless their capability holds; the
// whole section is null only when NEITHER is authorized (then no finance query ran).
export interface Student360FinanceSection {
  billing: Student360BillingSummary | null;
  wallet: Student360WalletSummary | null;
}

export interface Student360Core {
  student: Student;
  enrollments: Enrollment[];
  activeEnrollments: Enrollment[];
  currentEnrollment: Enrollment | null;
  // null = finance not authorized (never fetched). See Student360FinanceSection.
  finance: Student360FinanceSection | null;
  subjectProgress: StudentSubjectProgress[];
  levelProgress: StudentLevelProgress[];
  courseProgress: StudentCourseProgress[];
  // Canonical academic headline figures (average/tallies/status) — the single source
  // of truth all surfaces consume (H2). Derived once here from the persisted rollups.
  academicSummary: StudentAcademicSummary;
  // Canonical risk classification (H6) — the single answer to "at risk? why? severity?
  // action?". Alerts, overview risk chips and the health card all read this; none re-derive.
  riskSummary: StudentRiskSummary;
  attendanceSubjects: SubjectAttendanceView[];
  // Canonical attendance read model (H5) — overall percentage + per-status counts,
  // the single value/counts every surface displays. Never a mean of per-subject %.
  attendanceSummary: StudentAttendanceSummary;
  lastActivityAt: Date | null;
  recentTimeline: StudentTimelineEvent[];
  documentCount: number;
  pendingJustificationCount: number;
}

// Fetch the finance section, honouring the two independent capabilities:
//  - the statement is read only if AT LEAST ONE half is authorized (it is the shared
//    source of both billing and wallet KPIs);
//  - the wallet entity + movements are read only if the wallet half is authorized.
// Each returned half is a projection carrying only its own fields; an unauthorized half
// is null (never fetched/serialized). Returns null only when NEITHER half is authorized.
async function loadFinanceSection(
  studentId: string,
  organizationId: string,
  capabilities: Student360Capabilities
): Promise<Student360FinanceSection | null> {
  const { canViewInvoices, canViewWallet } = capabilities;
  if (!canViewInvoices && !canViewWallet) return null;

  const [statement, walletData] = await Promise.all([
    getStudentFinancialStatement({ organizationId, studentId }),
    canViewWallet
      ? getWalletByStudentId(studentId, organizationId).then(async (wallet) => ({
          wallet,
          recentTransactions: wallet ? await getRecentTransactions(wallet.id, organizationId, 3) : [],
        }))
      : Promise.resolve(null),
  ]);

  const billing: Student360BillingSummary | null = canViewInvoices
    ? {
        invoices: statement?.invoices ?? [],
        payments: statement?.payments ?? [],
        receipts: statement?.receipts ?? [],
        totalInvoiced: statement?.kpis.totalInvoiced ?? 0,
        totalPaid: statement?.kpis.totalPaid ?? 0,
        outstandingBalance: statement?.kpis.outstandingBalance ?? 0,
      }
    : null;

  const wallet: Student360WalletSummary | null =
    canViewWallet && walletData
      ? {
          wallet: walletData.wallet,
          recentTransactions: walletData.recentTransactions,
          walletBalance: statement?.kpis.walletBalance ?? 0,
          creditApplied: statement?.kpis.creditApplied ?? 0,
          totalRefunded: statement?.kpis.totalRefunded ?? 0,
          refunds: statement?.refunds ?? [],
        }
      : null;

  return { billing, wallet };
}

export async function getStudent360Core(
  studentId: string,
  organizationId: string,
  capabilities: Student360Capabilities
): Promise<Student360Core> {
  const student = await getStudentById(studentId, organizationId);

  // Finance is fetched in parallel with the rest, honouring the two capabilities.
  // With neither authorized, no finance query is issued (security + performance).
  const financePromise = loadFinanceSection(studentId, organizationId, capabilities);

  const [
    enrollmentsResult,
    subjectProgressResult,
    levelProgress,
    courseProgress,
    lastActivityAt,
    recentTimeline,
    documentCount,
    justificationsResult,
    finance,
  ] = await Promise.all([
    getEnrollmentsByOrganization(organizationId, { studentId, page: 1, pageSize: 50 }),
    findProgressByOrganization(organizationId, { studentId, page: 1, pageSize: 200 }),
    findLevelProgressByStudent(studentId, organizationId),
    findCourseProgressByStudent(studentId, organizationId),
    findLastActivityAt(studentId, organizationId),
    getRecentTimelineEvents(studentId, organizationId, 5),
    getStudentDocumentCount(studentId, organizationId),
    findJustificationsByOrganization(organizationId, { studentId, status: "PENDING", page: 1, pageSize: 1 }),
    financePromise,
  ]);

  const enrollments = enrollmentsResult.data;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");

  // Source of truth: persisted StudentSubjectAttendanceSummary (Phase 3), never
  // recomputed on-read. Missing summaries surface as NOT_STARTED / null. The
  // per-status counts come from the persisted period year-rollups (Phase 4).
  const [attendanceSubjects, attendanceSummary] = await Promise.all([
    getStudentSubjectAttendanceViews(
      studentId,
      activeEnrollments.map((e) => ({ id: e.id, classGroupId: e.classGroupId ?? null })),
      organizationId
    ).catch(() => [] as SubjectAttendanceView[]),
    getStudentAttendanceSummary(studentId, organizationId).catch(
      (): StudentAttendanceSummary => ({
        totalSessions: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0,
        attendancePercentage: null, attendedSessions: 0,
      })
    ),
  ]);

  const currentEnrollment = activeEnrollments[0] ?? enrollments[0] ?? null;

  // Single canonical academic read model — every surface reads these figures (H2).
  const academicSummary = buildStudentAcademicSummary({
    subjectProgress: subjectProgressResult.data,
    levelProgress,
    courseProgress,
    currentEnrollment,
  });

  // Single canonical risk classification (H6), derived from the consolidated read models.
  // financial is null unless the viewer is authorized for finance → no hidden-risk inference.
  const financeAuthorized = finance != null && (finance.billing != null || finance.wallet != null);
  const riskInput: StudentRiskInput = {
    blockedLevelCount: levelProgress.filter((p) => p.status === "BLOCKED").length,
    recoveryRequiredCount: levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length,
    hasActiveEnrollment: activeEnrollments.length > 0,
    hasAnyEnrollment: enrollments.length > 0,
    failedSubjectCount: academicSummary.failedSubjects,
    incompleteAssessmentCount: academicSummary.incompleteSubjects,
    belowRequiredAttendanceCount: attendanceSubjects.filter((s) => s.status === "BELOW_REQUIRED").length,
    pendingJustificationCount: justificationsResult.total,
    documentCount,
    financial: financeAuthorized
      ? {
          overdueInvoiceCount: finance?.billing?.invoices.filter((i) => i.status === "OVERDUE").length ?? 0,
          pendingRefundCount:
            finance?.wallet?.refunds.filter((r) => r.status === "REQUESTED" || r.status === "APPROVED").length ?? 0,
        }
      : null,
    hasAcademicData: subjectProgressResult.data.length > 0 || academicSummary.gradedSubjects > 0,
    hasAttendanceData: attendanceSummary.attendancePercentage != null,
  };
  const riskSummary = buildStudentRiskSummary(riskInput);

  return {
    student,
    enrollments,
    activeEnrollments,
    currentEnrollment,
    finance,
    subjectProgress: subjectProgressResult.data,
    levelProgress,
    courseProgress,
    academicSummary,
    riskSummary,
    attendanceSubjects,
    attendanceSummary,
    lastActivityAt,
    recentTimeline,
    documentCount,
    pendingJustificationCount: justificationsResult.total,
  };
}

// Projects the canonical risk reasons (H6) into the StudentAlert shape the alerts panel
// consumes — the alerts are NOT recomputed; they are the risk reasons, formatted.
const RISK_LEVEL_TO_ALERT_SEVERITY: Record<string, StudentAlert["severity"]> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MEDIUM",
  LOW: "MEDIUM",
};

export function toStudentAlerts(risk: StudentRiskSummary): StudentAlert[] {
  return risk.reasons.map((r) => ({
    id: r.id,
    severity: RISK_LEVEL_TO_ALERT_SEVERITY[r.level] ?? "MEDIUM",
    message: r.message,
    recommendedAction: r.recommendedAction,
    href: r.href,
  }));
}

export function buildHealthScoreInput(core: Student360Core): HealthScoreInput {
  return {
    subjectStatuses: core.subjectProgress.map((p) => p.status),
    levelStatuses: core.levelProgress.map((p) => p.status),
    // The health finance axis is composed of BILLING signals; it is included only when
    // billing is authorized (wallet carries no health signal in v1), otherwise excluded.
    finance: core.finance?.billing
      ? {
          outstandingBalance: core.finance.billing.outstandingBalance,
          hasOverdueInvoice: core.finance.billing.invoices.some((i) => i.status === "OVERDUE"),
        }
      : null,
    // Canonical attendance percentage (H5) — the same value shown everywhere; null when
    // there are no scheduled sessions (the axis is then excluded, not treated as 0/100).
    attendancePercentage: core.attendanceSummary.attendancePercentage,
    hasBelowRequiredAttendance: core.attendanceSubjects.some((s) => s.status === "BELOW_REQUIRED"),
    enrollmentStatuses: core.enrollments.map((e) => e.status),
    lastActivityAt: core.lastActivityAt,
  };
}

export function buildSummaryCards(core: Student360Core, openAlertsCount: number): StudentSummaryCards {
  return {
    activeEnrollments: core.activeEnrollments.length,
    currentCourseName: core.currentEnrollment?.courseName ?? null,
    // Academic headline figures come from the canonical read model (H2), never recomputed here.
    academicStatusLabel: core.academicSummary.progressionStatus,
    // Canonical attendance percentage (H5) — single source, never a mean of subjects here.
    attendancePercentage: core.attendanceSummary.attendancePercentage,
    subjectAverage: core.academicSummary.subjectAverage,
    // Each KPI only when its capability is authorized; otherwise the card is not produced.
    outstandingBalance: core.finance?.billing ? core.finance.billing.outstandingBalance : null,
    walletBalance: core.finance?.wallet ? core.finance.wallet.walletBalance : null,
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
