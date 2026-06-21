import {
  findBlockedStudents,
  findRecoveryRequiredStudents,
  findStudentsWithLowAttendance,
  findEligibleNoActionStudents,
} from "@/modules/dashboard/repositories/dashboard-academic.repository";
import { getAssessmentWatchlist } from "@/modules/assessments/services/assessment-watchlist.service";
import type { AcademicWatchlistItem, DashboardSeverity } from "@/modules/dashboard/types";

const SEVERITY_RANK: Record<DashboardSeverity, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
const WATCHLIST_LIMIT = 15;

const ASSESSMENT_SEVERITY: Record<string, DashboardSeverity> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

// =============================================================================
// ACADEMIC WATCHLIST
// Merges student-level risk signals (blocked / recovery / low attendance /
// eligible-without-action — dashboard-academic.repository.ts) with the
// Assessments module's own watchlist (getAssessmentWatchlist, already
// severity-ranked and capped at 15), which covers "avaliação OPEN após
// prazo" and "avaliações agendadas para esta semana" exactly as the spec
// describes — reused rather than reimplemented.
// =============================================================================

export async function getAcademicWatchlist(organizationId: string): Promise<AcademicWatchlistItem[]> {
  const [blocked, recovery, lowAttendance, eligibleNoAction, assessmentItems] = await Promise.all([
    findBlockedStudents(organizationId),
    findRecoveryRequiredStudents(organizationId),
    findStudentsWithLowAttendance(organizationId),
    findEligibleNoActionStudents(organizationId),
    getAssessmentWatchlist(organizationId),
  ]);

  const studentItems: AcademicWatchlistItem[] = [...blocked, ...recovery, ...lowAttendance, ...eligibleNoAction].map(
    (r) => ({
      id: `${r.studentId}:${r.issue}`,
      severity: r.severity,
      studentId: r.studentId,
      studentName: r.studentName,
      courseName: r.courseName,
      issue: r.issue,
      link: `/students/${r.studentId}`,
    })
  );

  const assessmentWatchlistItems: AcademicWatchlistItem[] = assessmentItems.map((a) => ({
    id: a.id,
    severity: ASSESSMENT_SEVERITY[a.severity] ?? "LOW",
    studentId: null,
    studentName: null,
    courseName: a.classGroupName,
    issue: `${a.title} — ${a.issues.join("; ")}`,
    link: `/assessments/${a.id}`,
  }));

  return [...studentItems, ...assessmentWatchlistItems]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, WATCHLIST_LIMIT);
}
