import { getStudentById } from "@/modules/students/services/student.service";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import {
  getStudentFinanceSummary,
  getStudentInvoicesPage,
  getStudentPaymentsPage,
  getStudentReceiptsPage,
  getStudentRefundsPage,
} from "@/modules/reports/finance/services/financial-reports.service";
import type { PaginationParams, PaginatedResult } from "@/shared/types/common";
import type {
  StudentStatementInvoice,
  StudentStatementPayment,
  StudentStatementReceipt,
  StudentStatementRefund,
} from "@/modules/reports/finance/types";
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
import {
  evaluateEligibilityForAllSubjects,
  loadEligibilityEvaluationContext,
} from "@/modules/prerequisites/engines/subject-eligibility.engine";
import { getWalletByStudentId, getRecentTransactions } from "@/modules/wallets/services/wallet.service";
import {
  findAttendanceRecordsByStudent,
  findLastActivityAt,
} from "@/modules/students/student-360/repositories/student-360.repository";
// Academic progression state is OWNED by the prerequisites module — Student 360 consumes
// its reads, never queries its tables (M1).
import { findLevelProgressByStudent } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { findCourseProgressByStudent } from "@/modules/prerequisites/repositories/student-course-progress.repository";
import {
  buildStudentAcademicSummary,
  resolveCurrentEnrollmentLevel,
  type StudentAcademicSummary,
  type ResolvedEnrollmentLevel,
} from "@/modules/students/services/student-academic-summary.service";

// Re-exported from the academic contract for the Student 360 tab loaders + callers that
// still reference it; the definition (progression knowledge) lives in the academic summary.
export { resolveCurrentEnrollmentLevel };
export type { ResolvedEnrollmentLevel };
import {
  buildStudentRiskSummary,
  assembleStudentRiskInput,
  type StudentRiskSummary,
  type StudentRiskInput,
} from "@/modules/students/services/student-risk.service";
import type {
  HealthScoreInput,
  Student360Capabilities,
  StudentAlert,
} from "@/modules/students/student-360/types";
import type { Student } from "@/modules/students/types";
import type { Enrollment } from "@/modules/enrollments/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { SUBJECT_ELIGIBILITY_STATUS } from "@/modules/prerequisites/types";
import type { StudentLevelProgress, StudentCourseProgress, SubjectEligibilityResult } from "@/modules/prerequisites/types";
import type { SubjectAttendanceView, StudentAttendanceSummary } from "@/modules/attendance/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";
import type { LevelSubject } from "@/modules/courses/types";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

// Finance is split into two independently-authorized halves, and each is a SUMMARY of
// aggregate indicators only (H3) — never the invoice/payment/receipt/refund lists. The
// full history is loaded lazily and paged in the finance tab (M2). A billing-only viewer
// never receives wallet figures, and vice-versa (H1).

// Billing (INVOICES_VIEW): invoice + payment aggregates.
export interface Student360BillingSummary {
  totalInvoiced: number;
  totalPaid: number;
  outstandingBalance: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
  unpaidInvoiceCount: number;
  nextDueDate: Date | null;
  lastPaymentDate: Date | null;
}

// Wallet (WALLETS_VIEW): wallet/credit/refund aggregates + the wallet card's own data.
export interface Student360WalletSummary {
  walletBalance: number;
  creditApplied: number;
  totalRefunded: number;
  pendingRefundCount: number;
  wallet: StudentWallet | null;
  recentTransactions: WalletTransaction[];
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
  // Academic (F-M6): null when the viewer lacks academic permission — not fetched, not
  // serialized. subjectProgress is [] in that case.
  subjectProgress: StudentSubjectProgress[];
  // Progression (F-M6): [] when the viewer lacks progression permission.
  levelProgress: StudentLevelProgress[];
  courseProgress: StudentCourseProgress[];
  // Canonical academic headline figures (average/tallies/status) — the single source
  // of truth all surfaces consume (H2). null when academic is not authorized (F-M6).
  academicSummary: StudentAcademicSummary | null;
  // Canonical risk classification (H6) — computed from ONLY the viewer's authorized
  // dimensions, so the global level never leaks a hidden dimension (F-M6, like finance H1).
  riskSummary: StudentRiskSummary;
  // Attendance (F-M6): null / [] when the viewer lacks attendance permission.
  attendanceSubjects: SubjectAttendanceView[];
  // Canonical attendance read model (H5). null when attendance is not authorized (F-M6).
  attendanceSummary: StudentAttendanceSummary | null;
  lastActivityAt: Date | null;
  // Recent activity filtered to the viewer's authorized dimensions (F-M6).
  recentTimeline: StudentTimelineEvent[];
  // null when the viewer lacks documents permission (F-M6).
  documentCount: number | null;
  pendingJustificationCount: number;
}

// Fetch the finance section as AGGREGATE SUMMARIES only (H3) — never the history lists.
//  - the SQL-aggregated summary is read only if AT LEAST ONE half is authorized;
//  - the wallet entity + recent movements (for the wallet card) only if the wallet half is.
// Each returned half is null unless its capability holds (never fetched/serialized).
// Returns null only when NEITHER half is authorized. No full-table load happens here.
async function loadFinanceSection(
  studentId: string,
  organizationId: string,
  capabilities: Student360Capabilities
): Promise<Student360FinanceSection | null> {
  const { canViewInvoices, canViewWallet } = capabilities;
  if (!canViewInvoices && !canViewWallet) return null;

  const [summary, walletData] = await Promise.all([
    getStudentFinanceSummary(studentId, organizationId),
    canViewWallet
      ? getWalletByStudentId(studentId, organizationId).then(async (wallet) => ({
          wallet,
          recentTransactions: wallet ? await getRecentTransactions(wallet.id, organizationId, 3) : [],
        }))
      : Promise.resolve(null),
  ]);

  const billing: Student360BillingSummary | null = canViewInvoices
    ? {
        totalInvoiced: summary.totalInvoiced,
        totalPaid: summary.totalPaid,
        outstandingBalance: summary.outstandingBalance,
        overdueAmount: summary.overdueAmount,
        overdueInvoiceCount: summary.overdueInvoiceCount,
        unpaidInvoiceCount: summary.unpaidInvoiceCount,
        nextDueDate: summary.nextDueDate,
        lastPaymentDate: summary.lastPaymentDate,
      }
    : null;

  const wallet: Student360WalletSummary | null =
    canViewWallet && walletData
      ? {
          walletBalance: summary.walletBalance,
          creditApplied: summary.creditApplied,
          totalRefunded: summary.totalRefunded,
          pendingRefundCount: summary.pendingRefundCount,
          wallet: walletData.wallet,
          recentTransactions: walletData.recentTransactions,
        }
      : null;

  return { billing, wallet };
}

export async function getStudent360Core(
  studentId: string,
  organizationId: string,
  capabilities: Student360Capabilities
): Promise<Student360Core> {
  // F-M6: per-dimension gating. The view flags default to TRUE when omitted (portals rely on
  // this); the /students page passes the viewer's real permissions. A false flag ⇒ NO query,
  // NO DTO section, and NO risk reason for that dimension (no inference via the global level).
  const canAcademic = capabilities.canViewAcademic ?? true;
  const canAttendance = capabilities.canViewAttendance ?? true;
  const canProgression = capabilities.canViewProgression ?? true;
  const canDocuments = capabilities.canViewDocuments ?? true;
  const canTimeline = capabilities.canViewTimeline ?? true;
  const financeVisible = (capabilities.canViewInvoices || capabilities.canViewWallet) ?? true;

  const student = await getStudentById(studentId, organizationId);

  // Finance is fetched honouring the two finance capabilities (no query if neither) — H1.
  const financePromise = loadFinanceSection(studentId, organizationId, capabilities);

  // levelProgress/courseProgress are needed by the academic summary (currentLevel /
  // progressionStatus) too, so they are fetched when EITHER academic or progression is
  // authorized; the DTO arrays are still gated by canProgression below.
  const needsProgressRows = canProgression || canAcademic;

  const [
    enrollmentsResult,
    subjectProgress,
    levelProgress,
    courseProgress,
    lastActivityAt,
    recentTimelineAll,
    documentCount,
    pendingJustificationCount,
    finance,
  ] = await Promise.all([
    getEnrollmentsByOrganization(organizationId, { studentId, page: 1, pageSize: 50 }),
    canAcademic
      ? findProgressByOrganization(organizationId, { studentId, page: 1, pageSize: 200 }).then((r) => r.data)
      : Promise.resolve([] as StudentSubjectProgress[]),
    needsProgressRows ? findLevelProgressByStudent(studentId, organizationId) : Promise.resolve([] as StudentLevelProgress[]),
    needsProgressRows ? findCourseProgressByStudent(studentId, organizationId) : Promise.resolve([] as StudentCourseProgress[]),
    findLastActivityAt(studentId, organizationId),
    canTimeline ? getRecentTimelineEvents(studentId, organizationId, 5) : Promise.resolve([] as StudentTimelineEvent[]),
    canDocuments ? getStudentDocumentCount(studentId, organizationId) : Promise.resolve<number | null>(null),
    canAttendance
      ? findJustificationsByOrganization(organizationId, { studentId, status: "PENDING", page: 1, pageSize: 1 }).then((r) => r.total)
      : Promise.resolve(0),
    financePromise,
  ]);

  const enrollments = enrollmentsResult.data;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const currentEnrollment = activeEnrollments[0] ?? enrollments[0] ?? null;

  // Attendance read models (H5) — fetched only when authorized (F-M6). null summary ⇒ the
  // attendance axis is excluded from health and produces no attendance risk reason.
  const [attendanceSubjects, attendanceSummary] = canAttendance
    ? await Promise.all([
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
      ])
    : [[] as SubjectAttendanceView[], null as StudentAttendanceSummary | null];

  // Single canonical academic read model (H2) — null when academic is not authorized (F-M6).
  const academicSummary = canAcademic
    ? buildStudentAcademicSummary({ subjectProgress, levelProgress, courseProgress, currentEnrollment })
    : null;

  // Single canonical risk classification (H6). Each dimension's signals are fed ONLY when the
  // viewer is authorized for it — an unauthorized dimension contributes no reason and is
  // excluded from the overall level, so the level can never leak a hidden dimension (F-M6,
  // uniform with the H1 finance-null pattern).
  const financeAuthorized = finance != null && (finance.billing != null || finance.wallet != null);
  const riskInput: StudentRiskInput = assembleStudentRiskInput({
    enrollmentCount: enrollments.length,
    activeEnrollmentCount: activeEnrollments.length,
    blockedLevelCount: canProgression ? levelProgress.filter((p) => p.status === "BLOCKED").length : 0,
    recoveryRequiredCount: canProgression ? levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length : 0,
    failedSubjectCount: academicSummary?.failedSubjects ?? 0,
    incompleteAssessmentCount: academicSummary?.incompleteSubjects ?? 0,
    gradedSubjectCount: academicSummary?.gradedSubjects ?? 0,
    subjectProgressCount: subjectProgress.length,
    belowRequiredAttendanceCount: attendanceSubjects.filter((s) => s.status === "BELOW_REQUIRED").length,
    pendingJustificationCount,
    documentCount, // null when unauthorized → documents dimension excluded
    attendancePercentage: attendanceSummary?.attendancePercentage ?? null,
    financial: financeAuthorized
      ? {
          overdueInvoiceCount: finance?.billing?.overdueInvoiceCount ?? 0,
          pendingRefundCount: finance?.wallet?.pendingRefundCount ?? 0,
        }
      : null,
  });
  const riskSummary = buildStudentRiskSummary(riskInput);

  return {
    student,
    enrollments,
    activeEnrollments,
    currentEnrollment,
    finance,
    subjectProgress,
    levelProgress: canProgression ? levelProgress : [],
    courseProgress: canProgression ? courseProgress : [],
    academicSummary,
    riskSummary,
    attendanceSubjects,
    attendanceSummary,
    lastActivityAt,
    recentTimeline: filterRecentTimelineByCapabilities(recentTimelineAll, {
      academic: canAcademic,
      attendance: canAttendance,
      progression: canProgression,
      documents: canDocuments,
      finance: financeVisible,
    }),
    documentCount,
    pendingJustificationCount,
  };
}

// F-M6: recent-activity gating. Each timeline event belongs to a dimension (by its eventType);
// an event whose dimension the viewer can't see is dropped BEFORE serialization, so the count
// and the list are already permission-correct. Enrollment/other events stay visible.
function filterRecentTimelineByCapabilities(
  events: StudentTimelineEvent[],
  caps: { academic: boolean; attendance: boolean; progression: boolean; documents: boolean; finance: boolean }
): StudentTimelineEvent[] {
  return events.filter((e) => {
    const t = e.eventType;
    if (/INVOICE|PAYMENT|RECEIPT|WALLET|REFUND/.test(t)) return caps.finance;
    if (/ATTENDANCE/.test(t)) return caps.attendance;
    if (/SUBJECT|GRADE|ASSESSMENT/.test(t)) return caps.academic;
    if (/DOCUMENT/.test(t)) return caps.documents;
    if (/PROGRESSION|LEVEL_|COURSE_COMPLET/.test(t)) return caps.progression;
    return true; // enrollment / notes / other → not gated
  });
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
          hasOverdueInvoice: core.finance.billing.overdueInvoiceCount > 0,
        }
      : null,
    // Canonical attendance percentage (H5) — the same value shown everywhere; null when
    // there are no scheduled sessions (the axis is then excluded, not treated as 0/100).
    attendancePercentage: core.attendanceSummary?.attendancePercentage ?? null,
    hasBelowRequiredAttendance: core.attendanceSubjects.some((s) => s.status === "BELOW_REQUIRED"),
    enrollmentStatuses: core.enrollments.map((e) => e.status),
    lastActivityAt: core.lastActivityAt,
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

// ── Finance history (M2): server-side paginated, lazy, one section at a time ──────
export type FinanceSection = "invoices" | "payments" | "receipts" | "refunds";

export type FinanceTabData =
  | { section: "invoices"; page: PaginatedResult<StudentStatementInvoice> }
  | { section: "payments"; page: PaginatedResult<StudentStatementPayment> }
  | { section: "receipts"; page: PaginatedResult<StudentStatementReceipt> }
  | { section: "refunds"; page: PaginatedResult<StudentStatementRefund> };

// Page size is fixed server-side (never taken from the client) and bounded.
const FINANCE_HISTORY_PAGE_SIZE = 20;

// Fetch one page; if the requested page is beyond the last (e.g. ?page=999), normalize
// to the last page rather than showing a misleading empty state.
async function paginateFinance<T>(
  fetchPage: (p: PaginationParams) => Promise<PaginatedResult<T>>,
  page: number
): Promise<PaginatedResult<T>> {
  const requested = Math.max(1, Math.floor(page) || 1);
  const result = await fetchPage({ page: requested, pageSize: FINANCE_HISTORY_PAGE_SIZE });
  if (result.total > 0 && result.totalPages > 0 && requested > result.totalPages) {
    return fetchPage({ page: result.totalPages, pageSize: FINANCE_HISTORY_PAGE_SIZE });
  }
  return result;
}

/**
 * One bounded page of the student's finance history for the ACTIVE section only (M2).
 * Lazy: called only when the finance tab is open. Permission-gated (H1) — billing
 * sections require INVOICES_VIEW, refunds require WALLETS_VIEW; an unauthorized section
 * returns null and issues NO finance query. Summary KPIs are separate (page-independent).
 */
export async function getFinanceTabData(
  studentId: string,
  organizationId: string,
  section: FinanceSection,
  page: number,
  capabilities: Student360Capabilities
): Promise<FinanceTabData | null> {
  const authorized = section === "refunds" ? capabilities.canViewWallet : capabilities.canViewInvoices;
  if (!authorized) return null;

  const filters = { organizationId, studentId };
  switch (section) {
    case "invoices":
      return { section, page: await paginateFinance((p) => getStudentInvoicesPage(filters, p), page) };
    case "payments":
      return { section, page: await paginateFinance((p) => getStudentPaymentsPage(filters, p), page) };
    case "receipts":
      return { section, page: await paginateFinance((p) => getStudentReceiptsPage(filters, p), page) };
    case "refunds":
      return { section, page: await paginateFinance((p) => getStudentRefundsPage(filters, p), page) };
  }
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

export async function getProgressTabData(
  organizationId: string,
  currentEnrollment: Enrollment | null
): Promise<{ levelSubjects: LevelSubject[]; eligibility: SubjectEligibilityRow[] }> {
  const resolvedLevelId = resolveCurrentEnrollmentLevel(currentEnrollment).id;
  if (!currentEnrollment || !resolvedLevelId) {
    return { levelSubjects: [], eligibility: [] };
  }

  // H4: eligibility for the whole level is now a batch-load (constant query count) +
  // a PURE evaluation, instead of one query set per subject (the old N+1).
  const [levelSubjects, eligibilityContext] = await Promise.all([
    getLevelSubjectsByLevel(resolvedLevelId, organizationId),
    loadEligibilityEvaluationContext({
      organizationId,
      studentId: currentEnrollment.studentId,
      enrollmentId: currentEnrollment.id,
      courseLevelId: resolvedLevelId,
    }),
  ]);
  const eligibilityMap = evaluateEligibilityForAllSubjects(eligibilityContext);

  // The eligibility engine only evaluates ACTIVE level-subjects of the resolved level —
  // filter the display list to match so every row has a real result.
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
