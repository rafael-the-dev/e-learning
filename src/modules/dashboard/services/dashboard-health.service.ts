import { getAcademicRiskCounts } from "@/modules/dashboard/repositories/dashboard-academic.repository";
import { countOverdueInvoices, countRefundsPendingOver30Days } from "@/modules/dashboard/repositories/dashboard-financial.repository";
import { countCoursesWithoutStructure, countIncompleteEnrollments } from "@/modules/dashboard/repositories/dashboard-operational.repository";
import { countOpenIssuesBySeverity } from "@/modules/finance/integrity/repositories/integrity-issue.repository";
import { getReconciliationKPIs } from "@/modules/reports/finance/repositories/reconciliation.repository";
import { getOperationalIssues } from "@/modules/class-groups/services/class-group-metrics.service";
import { getRevenueTrendReport } from "@/modules/reports/finance/services/revenue-trend-report.service";
import type { HealthRating, HealthTrend, OrganizationHealthScore } from "@/modules/dashboard/types";

// =============================================================================
// ORGANIZATION HEALTH SCORE
// Each category starts at 100 and loses points per detected issue, capped per
// signal so no single count can single-handedly zero out a category — the
// same "deduction from 100, clamp at the end" shape as the Financial Closing
// Dashboard's Trust Score (trust-score.ts), extended to 4 weighted categories
// instead of 1. Weights: 30% financial, 30% academic, 20% attendance, 20%
// operational, per the spec.
// =============================================================================

function clamp(score: number): number {
  return Math.min(100, Math.max(0, score));
}

function rate(score: number): HealthRating {
  if (score >= 90) return "EXCELLENT";
  if (score >= 75) return "HEALTHY";
  if (score >= 50) return "ATTENTION";
  return "CRITICAL";
}

export async function getOrganizationHealthScore(organizationId: string): Promise<OrganizationHealthScore> {
  const [
    overdueInvoices,
    integritySeverity,
    reconciliation,
    refundsPending,
    academicCounts,
    operationalIssues,
    coursesWithoutStructure,
    incompleteEnrollments,
    revenueTrend,
  ] = await Promise.all([
    countOverdueInvoices(organizationId),
    countOpenIssuesBySeverity(organizationId),
    getReconciliationKPIs({ organizationId }),
    countRefundsPendingOver30Days(organizationId),
    getAcademicRiskCounts(organizationId),
    getOperationalIssues(organizationId),
    countCoursesWithoutStructure(organizationId),
    countIncompleteEnrollments(organizationId),
    getRevenueTrendReport({ organizationId }),
  ]);

  const financial = clamp(
    100 -
      Math.min(30, overdueInvoices * 2) -
      Math.min(20, integritySeverity.CRITICAL * 10) -
      Math.min(15, integritySeverity.HIGH * 5) -
      Math.min(20, reconciliation.mismatchedItems * 4) -
      Math.min(15, refundsPending * 5)
  );

  const academic = clamp(
    100 -
      Math.min(35, academicCounts.blockedStudents * 5) -
      Math.min(25, academicCounts.recoveryRequired * 3) -
      Math.min(20, academicCounts.overdueAssessments * 4) -
      Math.min(20, academicCounts.eligibleNoAction * 2)
  );

  // F-M8: the per-student low-attendance penalty comes from the canonical projection. When the
  // projection is UNAVAILABLE we exclude that term (no legacy re-derivation) and the attendance
  // category degrades to the operational class-group signal — never a fabricated count.
  const lowAttendancePenalty =
    academicCounts.studentsLowAttendance.status === "AVAILABLE"
      ? Math.min(60, academicCounts.studentsLowAttendance.data * 3)
      : 0;
  const attendance = clamp(
    100 - lowAttendancePenalty - Math.min(40, academicCounts.classGroupsLowAttendance * 8)
  );

  const operational = clamp(
    100 -
      Math.min(40, operationalIssues.noTeacherCount * 8) -
      Math.min(30, coursesWithoutStructure * 10) -
      Math.min(30, incompleteEnrollments * 3)
  );

  const score = Math.round(financial * 0.3 + academic * 0.3 + attendance * 0.2 + operational * 0.2);
  const rating: HealthRating = rate(score);

  // Trend proxy: month-over-month change in the collection rate, the
  // financial signal already computed (no historical health-score snapshot
  // is stored anywhere, so this is the closest real, already-fetched figure
  // rather than an invented one).
  const trend = computeTrend(revenueTrend.rows);

  const summary = buildSummary({
    overdueInvoices,
    criticalIntegrity: integritySeverity.CRITICAL,
    blockedStudents: academicCounts.blockedStudents,
    recoveryRequired: academicCounts.recoveryRequired,
    // Only surface the low-attendance line when the canonical figure is available (F-M8).
    studentsLowAttendance:
      academicCounts.studentsLowAttendance.status === "AVAILABLE"
        ? academicCounts.studentsLowAttendance.data
        : 0,
    noTeacherCount: operationalIssues.noTeacherCount,
  });

  return {
    score,
    rating,
    trend,
    summary,
    financial: { score: Math.round(financial), weight: 30 },
    academic: { score: Math.round(academic), weight: 30 },
    attendance: { score: Math.round(attendance), weight: 20 },
    operational: { score: Math.round(operational), weight: 20 },
  };
}

function computeTrend(rows: Array<{ collectionRate: number }>): HealthTrend {
  if (rows.length < 2) return "STABLE";
  const last = rows[rows.length - 1].collectionRate;
  const prev = rows[rows.length - 2].collectionRate;
  const diff = last - prev;
  if (diff > 1) return "UP";
  if (diff < -1) return "DOWN";
  return "STABLE";
}

function buildSummary(counts: {
  overdueInvoices: number;
  criticalIntegrity: number;
  blockedStudents: number;
  recoveryRequired: number;
  studentsLowAttendance: number;
  noTeacherCount: number;
}): string {
  const parts: string[] = [];
  if (counts.criticalIntegrity > 0) parts.push(`${counts.criticalIntegrity} problema(s) financeiro(s) crítico(s)`);
  if (counts.blockedStudents > 0) parts.push(`${counts.blockedStudents} aluno(s) bloqueado(s)`);
  if (counts.overdueInvoices > 0) parts.push(`${counts.overdueInvoices} fatura(s) vencida(s)`);
  if (counts.recoveryRequired > 0) parts.push(`${counts.recoveryRequired} aluno(s) em recuperação`);
  if (counts.studentsLowAttendance > 0) parts.push(`${counts.studentsLowAttendance} aluno(s) com presença baixa`);
  if (counts.noTeacherCount > 0) parts.push(`${counts.noTeacherCount} turma(s) sem professor`);

  if (parts.length === 0) return "Sem problemas relevantes detectados.";
  return parts.slice(0, 3).join(" · ");
}
