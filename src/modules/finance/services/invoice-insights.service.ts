import type {
  InvoiceDashboardKPIs,
  InvoiceCourseDistribution,
  InvoiceInsight,
} from "@/modules/finance/types";

export function generateInvoiceInsights(
  kpis: InvoiceDashboardKPIs,
  courseDistribution: InvoiceCourseDistribution[]
): InvoiceInsight[] {
  const insights: InvoiceInsight[] = [];

  // Overdue invoices
  if (kpis.overdueCount > 0) {
    insights.push({
      id: "overdue",
      message: `${kpis.overdueCount} ${kpis.overdueCount === 1 ? "fatura está vencida" : "faturas estão vencidas"}.`,
      severity: kpis.overdueCount >= 10 ? "critical" : "warning",
      count: kpis.overdueCount,
      linkHref: "/invoices?status=OVERDUE",
      linkLabel: "Ver vencidas",
    });
  }

  // No payment received
  if (kpis.noPaymentCount > 0) {
    insights.push({
      id: "no-payment",
      message: `${kpis.noPaymentCount} ${kpis.noPaymentCount === 1 ? "fatura ainda não recebeu nenhum pagamento" : "faturas ainda não receberam nenhum pagamento"}.`,
      severity: kpis.noPaymentCount >= 10 ? "critical" : "warning",
      count: kpis.noPaymentCount,
      linkHref: "/invoices?paymentStatus=NO_PAYMENT",
      linkLabel: "Ver sem pagamento",
    });
  }

  // Partially paid
  if (kpis.partiallyPaidCount > 0) {
    insights.push({
      id: "partially-paid",
      message: `${kpis.partiallyPaidCount} ${kpis.partiallyPaidCount === 1 ? "fatura está parcialmente paga" : "faturas estão parcialmente pagas"}.`,
      severity: "warning",
      count: kpis.partiallyPaidCount,
      linkHref: "/invoices?status=PARTIALLY_PAID",
      linkLabel: "Ver parcialmente pagas",
    });
  }

  // Due soon
  if (kpis.dueSoonCount > 0) {
    insights.push({
      id: "due-soon",
      message: `${kpis.dueSoonCount} ${kpis.dueSoonCount === 1 ? "fatura vence" : "faturas vencem"} nos próximos 3 dias.`,
      severity: "warning",
      count: kpis.dueSoonCount,
      linkHref: "/invoices?agingBucket=due-soon",
      linkLabel: "Ver a vencer",
    });
  }

  // Students with multiple pending invoices
  if (kpis.studentsWithMultiplePendingCount > 0) {
    insights.push({
      id: "multiple-pending",
      message: `${kpis.studentsWithMultiplePendingCount} ${kpis.studentsWithMultiplePendingCount === 1 ? "aluno tem" : "alunos têm"} mais de uma fatura pendente.`,
      severity: kpis.studentsWithMultiplePendingCount >= 5 ? "warning" : "info",
      count: kpis.studentsWithMultiplePendingCount,
    });
  }

  // Top course by revenue this month
  const totalCourseAmount = courseDistribution.reduce((s, c) => s + c.totalAmount, 0);
  if (totalCourseAmount > 0 && courseDistribution.length > 0) {
    const top = courseDistribution[0];
    const pct = Math.round((top.totalAmount / totalCourseAmount) * 100);
    if (pct >= 20) {
      insights.push({
        id: "top-course",
        message: `${top.courseName} representa ${pct}% da facturação deste mês.`,
        severity: "info",
        count: top.count,
      });
    }
  }

  // Cancelled count
  if (kpis.cancelledCount > 0) {
    insights.push({
      id: "cancelled",
      message: `${kpis.cancelledCount} ${kpis.cancelledCount === 1 ? "fatura foi cancelada" : "faturas foram canceladas"}.`,
      severity: kpis.cancelledCount >= 5 ? "warning" : "info",
      count: kpis.cancelledCount,
      linkHref: "/invoices?status=CANCELLED",
      linkLabel: "Ver canceladas",
    });
  }

  return insights;
}
