import type {
  EnrollmentDashboardKPIs,
  EnrollmentCourseDistribution,
  EnrollmentInsight,
} from "@/modules/enrollments/types";

export function generateEnrollmentInsights(
  kpis: EnrollmentDashboardKPIs,
  courseDistribution: EnrollmentCourseDistribution[]
): EnrollmentInsight[] {
  const insights: EnrollmentInsight[] = [];

  if (kpis.overdueAccounts > 0) {
    insights.push({
      id: "overdue-accounts",
      message: `${kpis.overdueAccounts} ${kpis.overdueAccounts === 1 ? "matrícula tem" : "matrículas têm"} faturas vencidas.`,
      severity: "critical",
      count: kpis.overdueAccounts,
      linkHref: "/enrollments?financialStatus=OVERDUE",
      linkLabel: "Ver matrículas",
    });
  }

  if (kpis.activeWithoutInvoice > 0) {
    insights.push({
      id: "no-invoice",
      message: `${kpis.activeWithoutInvoice} ${kpis.activeWithoutInvoice === 1 ? "matrícula ativa não possui" : "matrículas ativas não possuem"} fatura associada.`,
      severity: "critical",
      count: kpis.activeWithoutInvoice,
      linkHref: "/enrollments?financialStatus=NO_INVOICE",
      linkLabel: "Ver matrículas",
    });
  }

  if (kpis.pendingPayment > 0) {
    insights.push({
      id: "pending-payment",
      message: `${kpis.pendingPayment} ${kpis.pendingPayment === 1 ? "matrícula aguarda" : "matrículas aguardam"} primeiro pagamento.`,
      severity: kpis.pendingPayment > 10 ? "critical" : "warning",
      count: kpis.pendingPayment,
      linkHref: "/enrollments?status=PENDING_PAYMENT",
      linkLabel: "Ver matrículas",
    });
  }

  if (kpis.awaitingClassAssignment > 0) {
    insights.push({
      id: "no-class-group",
      message: `${kpis.awaitingClassAssignment} ${kpis.awaitingClassAssignment === 1 ? "aluno ativo ainda não tem" : "alunos ativos ainda não têm"} turma atribuída.`,
      severity: "warning",
      count: kpis.awaitingClassAssignment,
    });
  }

  if (kpis.suspended > 0) {
    insights.push({
      id: "suspended",
      message: `${kpis.suspended} ${kpis.suspended === 1 ? "matrícula está suspensa" : "matrículas estão suspensas"}.`,
      severity: "warning",
      count: kpis.suspended,
      linkHref: "/enrollments?status=SUSPENDED",
      linkLabel: "Ver matrículas",
    });
  }

  if (kpis.studentsWithWalletCredit > 0) {
    insights.push({
      id: "wallet-credit",
      message: `${kpis.studentsWithWalletCredit} ${kpis.studentsWithWalletCredit === 1 ? "aluno possui" : "alunos possuem"} crédito disponível na carteira.`,
      severity: "info",
      count: kpis.studentsWithWalletCredit,
    });
  }

  if (courseDistribution.length > 0 && kpis.active > 0) {
    const top = courseDistribution[0];
    const pct = Math.round((top.activeCount / kpis.active) * 100);
    if (pct >= 30) {
      insights.push({
        id: "top-course",
        message: `O curso ${top.courseName} representa ${pct}% das matrículas ativas.`,
        severity: "info",
        count: top.activeCount,
      });
    }
  }

  return insights;
}
