import { getAcademicRiskCounts } from "@/modules/dashboard/repositories/dashboard-academic.repository";
import { countOverdueInvoices, countRefundsPendingOver30Days } from "@/modules/dashboard/repositories/dashboard-financial.repository";
import type { DashboardAlert } from "@/modules/dashboard/types";

// =============================================================================
// ALERTS — quick top-line summary, built from the same counts already
// computed for the Health Score and KPI grid (dashboard-academic.repository.ts,
// dashboard-financial.repository.ts). Hidden entirely when empty.
// =============================================================================

export async function getAlerts(organizationId: string): Promise<DashboardAlert[]> {
  const [academicRisk, overdueInvoices, refundsPending] = await Promise.all([
    getAcademicRiskCounts(organizationId),
    countOverdueInvoices(organizationId),
    countRefundsPendingOver30Days(organizationId),
  ]);

  const alerts: DashboardAlert[] = [];

  if (overdueInvoices > 0) {
    alerts.push({
      id: "overdue-invoices",
      severity: "HIGH",
      message: `${overdueInvoices} ${overdueInvoices === 1 ? "fatura vencida" : "faturas vencidas"}`,
      link: "/invoices?status=OVERDUE",
    });
  }
  if (academicRisk.blockedStudents > 0) {
    alerts.push({
      id: "blocked-students",
      severity: "CRITICAL",
      message: `${academicRisk.blockedStudents} ${academicRisk.blockedStudents === 1 ? "aluno bloqueado" : "alunos bloqueados"}`,
      link: "/level-progression",
    });
  }
  if (academicRisk.overdueAssessments > 0) {
    alerts.push({
      id: "overdue-assessments",
      severity: "HIGH",
      message: `${academicRisk.overdueAssessments} ${academicRisk.overdueAssessments === 1 ? "avaliação em atraso" : "avaliações em atraso"}`,
      link: "/assessments",
    });
  }
  if (refundsPending > 0) {
    alerts.push({
      id: "refunds-pending",
      severity: "MEDIUM",
      message: `${refundsPending} ${refundsPending === 1 ? "reembolso pendente" : "reembolsos pendentes"} há mais de 30 dias`,
      link: "/reports/finance/refund-analysis",
    });
  }

  return alerts;
}
