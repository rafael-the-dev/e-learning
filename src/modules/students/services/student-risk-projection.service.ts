// =============================================================================
// STUDENT RISK PROJECTION — recalculation service (M11.2)
//
// Recomputes the canonical per-student risk classification and persists it. It uses
// the SAME H6 engine (buildStudentRiskSummary) and the SAME input assembler
// (assembleStudentRiskInput) that Student 360 uses — the risk RULES are not copied,
// only invoked. The projection is an org-internal artifact, so it is always computed
// with finance INCLUDED; the engine is run twice (with and without the financial
// dimension) to persist both `level` and `levelWithoutFinance` — the H6 permission-aware
// pair — so a finance-blind dashboard can never infer a hidden financial reason.
//
// Idempotent: if the recomputed classification is identical to what is stored (same
// rules version), the write is skipped. Runs in its own path — a projection failure must
// never roll back the primary mutation that triggered it.
// =============================================================================

import { getStudentById } from "@/modules/students/services/student.service";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import { getStudentFinanceSummary } from "@/modules/reports/finance/services/financial-reports.service";
import { findProgressByOrganization } from "@/modules/assessments/repositories/student-subject-progress.repository";
import {
  getStudentSubjectAttendanceViews,
  getStudentAttendanceSummary,
} from "@/modules/attendance/services/attendance-read-model.service";
import { findJustificationsByOrganization } from "@/modules/attendance/repositories/attendance-justification.repository";
import { getStudentDocumentCount } from "@/modules/student-documents/services/student-document.service";
import { findLevelProgressByStudent } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { findCourseProgressByStudent } from "@/modules/prerequisites/repositories/student-course-progress.repository";
import { buildStudentAcademicSummary } from "@/modules/students/services/student-academic-summary.service";
import {
  buildStudentRiskSummary,
  assembleStudentRiskInput,
  isRiskLevelAtRisk,
  riskLevelRank,
  STUDENT_RISK_SOURCE_VERSION,
  type StudentRiskReason,
  type StudentRiskSignals,
} from "@/modules/students/services/student-risk.service";
import {
  upsertStudentRiskProjection,
  findStudentRiskProjection,
} from "@/modules/students/repositories/student-risk-projection.repository";
import type {
  StudentRiskProjection,
  StudentRiskEvaluationStatus,
  UpsertStudentRiskProjectionData,
} from "@/modules/students/services/student-risk-projection.types";

export interface RecalculateStudentRiskProjectionResult {
  changed: boolean;
  projection: StudentRiskProjection;
}

/**
 * Gather the raw risk signals for one student, with finance ALWAYS included (the projection
 * is org-internal). Mirrors what Student 360 gathers, minus the presentation — the only
 * risk-relevant reads. Failures in optional read models degrade to the safe empty shape,
 * exactly like Student 360.
 */
async function loadStudentRiskSignals(studentId: string, organizationId: string): Promise<StudentRiskSignals> {
  const [
    enrollmentsResult,
    subjectProgressResult,
    levelProgress,
    courseProgress,
    documentCount,
    justificationsResult,
    financeSummary,
  ] = await Promise.all([
    getEnrollmentsByOrganization(organizationId, { studentId, page: 1, pageSize: 50 }),
    findProgressByOrganization(organizationId, { studentId, page: 1, pageSize: 200 }),
    findLevelProgressByStudent(studentId, organizationId),
    findCourseProgressByStudent(studentId, organizationId),
    getStudentDocumentCount(studentId, organizationId),
    findJustificationsByOrganization(organizationId, { studentId, status: "PENDING", page: 1, pageSize: 1 }),
    getStudentFinanceSummary(studentId, organizationId),
  ]);

  const enrollments = enrollmentsResult.data;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const currentEnrollment = activeEnrollments[0] ?? enrollments[0] ?? null;

  const [attendanceSubjects, attendanceSummary] = await Promise.all([
    getStudentSubjectAttendanceViews(
      studentId,
      activeEnrollments.map((e) => ({ id: e.id, classGroupId: e.classGroupId ?? null })),
      organizationId
    ).catch(() => []),
    getStudentAttendanceSummary(studentId, organizationId).catch(() => ({
      totalSessions: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0,
      attendancePercentage: null as number | null, attendedSessions: 0,
    })),
  ]);

  const academicSummary = buildStudentAcademicSummary({
    subjectProgress: subjectProgressResult.data,
    levelProgress,
    courseProgress,
    currentEnrollment,
  });

  return {
    enrollmentCount: enrollments.length,
    activeEnrollmentCount: activeEnrollments.length,
    blockedLevelCount: levelProgress.filter((p) => p.status === "BLOCKED").length,
    recoveryRequiredCount: levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length,
    failedSubjectCount: academicSummary.failedSubjects,
    incompleteAssessmentCount: academicSummary.incompleteSubjects,
    gradedSubjectCount: academicSummary.gradedSubjects,
    subjectProgressCount: subjectProgressResult.data.length,
    belowRequiredAttendanceCount: attendanceSubjects.filter((s) => s.status === "BELOW_REQUIRED").length,
    pendingJustificationCount: justificationsResult.total,
    documentCount,
    attendancePercentage: attendanceSummary.attendancePercentage,
    // Finance always included — the projection is org-internal (the READ layer redacts it).
    financial: {
      overdueInvoiceCount: financeSummary.overdueInvoiceCount,
      pendingRefundCount: financeSummary.pendingRefundCount,
    },
  };
}

/** Build the persistence payload from the engine's two passes (with / without finance). */
export function buildStudentRiskProjectionData(
  organizationId: string,
  studentId: string,
  signals: StudentRiskSignals,
  now: Date
): UpsertStudentRiskProjectionData {
  // Full pass: finance included → global `level`, per-dimension levels, reasons, action.
  const full = buildStudentRiskSummary(assembleStudentRiskInput(signals), now);
  // Finance-excluded pass → `levelWithoutFinance` (same rules, financial dimension dropped).
  const withoutFinance = buildStudentRiskSummary(
    assembleStudentRiskInput({ ...signals, financial: null }),
    now
  );

  // Persist reasons severity-ordered so the read layer's "primary reason" is reasons[0].
  const reasons: StudentRiskReason[] = [...full.reasons].sort(
    (a, b) => riskLevelRank(b.level) - riskLevelRank(a.level)
  );

  const evaluationStatus: StudentRiskEvaluationStatus =
    full.level === "UNKNOWN" ? "INSUFFICIENT_DATA" : "EVALUATED";

  return {
    organizationId,
    studentId,
    level: full.level,
    levelWithoutFinance: withoutFinance.level,
    isAtRisk: isRiskLevelAtRisk(full.level),
    evaluationStatus,
    academicLevel: full.academic?.level ?? "NONE",
    attendanceLevel: full.attendance?.level ?? "NONE",
    financialLevel: full.financial?.level ?? "NONE",
    progressionLevel: full.progression?.level ?? "NONE",
    documentsLevel: full.documents?.level ?? "NONE",
    reasons,
    recommendedAction: full.recommendedAction,
    sourceVersion: STUDENT_RISK_SOURCE_VERSION,
    evaluatedAt: now,
  };
}

/** True when the stored projection already matches the freshly-computed classification. */
function isUnchanged(existing: StudentRiskProjection | null, next: UpsertStudentRiskProjectionData): boolean {
  if (!existing) return false;
  return (
    existing.sourceVersion === next.sourceVersion &&
    existing.level === next.level &&
    existing.levelWithoutFinance === next.levelWithoutFinance &&
    existing.isAtRisk === next.isAtRisk &&
    existing.evaluationStatus === next.evaluationStatus &&
    existing.academicLevel === next.academicLevel &&
    existing.attendanceLevel === next.attendanceLevel &&
    existing.financialLevel === next.financialLevel &&
    existing.progressionLevel === next.progressionLevel &&
    existing.documentsLevel === next.documentsLevel &&
    existing.recommendedAction === next.recommendedAction &&
    JSON.stringify(existing.reasons) === JSON.stringify(next.reasons)
  );
}

/**
 * Recompute and persist the risk projection for one student. Idempotent: skips the write
 * when the classification is unchanged (the row's `evaluatedAt` then reflects the last
 * change, not the last check). Safe to call after any relevant mutation commits.
 */
export async function recalculateStudentRiskProjection(params: {
  organizationId: string;
  studentId: string;
  now?: Date;
}): Promise<RecalculateStudentRiskProjectionResult> {
  const { organizationId, studentId } = params;
  const now = params.now ?? new Date();

  // Guard: the student must belong to this org (tenant isolation) — throws NotFound otherwise.
  await getStudentById(studentId, organizationId);

  const signals = await loadStudentRiskSignals(studentId, organizationId);
  const data = buildStudentRiskProjectionData(organizationId, studentId, signals, now);

  const existing = await findStudentRiskProjection(studentId, organizationId);
  if (isUnchanged(existing, data)) {
    return { changed: false, projection: existing! };
  }

  const projection = await upsertStudentRiskProjection(data);
  return { changed: true, projection };
}
