import type {
  PaymentDashboardKPIs,
  PaymentMethodDistribution,
  PaymentInsight,
} from "@/modules/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

export function generatePaymentInsights(
  kpis: PaymentDashboardKPIs,
  methodDistribution: PaymentMethodDistribution[]
): PaymentInsight[] {
  const insights: PaymentInsight[] = [];

  // Critical: pending confirmations
  if (kpis.pendingCount > 0) {
    insights.push({
      id: "pending-confirmations",
      message: `${kpis.pendingCount} ${kpis.pendingCount === 1 ? "pagamento aguarda" : "pagamentos aguardam"} confirmação.`,
      severity: kpis.pendingCount >= 10 ? "critical" : "warning",
      count: kpis.pendingCount,
      linkHref: "/payments?status=PENDING",
      linkLabel: "Ver pendentes",
    });
  }

  // High: confirmed without receipt
  if (kpis.requireReceiptCount > 0) {
    insights.push({
      id: "missing-receipts",
      message: `${kpis.requireReceiptCount} ${kpis.requireReceiptCount === 1 ? "pagamento confirmado não tem recibo" : "pagamentos confirmados não têm recibo"}.`,
      severity: kpis.requireReceiptCount >= 5 ? "critical" : "warning",
      count: kpis.requireReceiptCount,
      linkHref: "/payments?receiptStatus=MISSING",
      linkLabel: "Ver sem recibo",
    });
  }

  // Medium: overpayments generated wallet credit
  if (kpis.overpaymentCount > 0) {
    insights.push({
      id: "overpayments",
      message: `${kpis.overpaymentCount} ${kpis.overpaymentCount === 1 ? "pagamento gerou crédito" : "pagamentos geraram crédito"} na carteira do aluno.`,
      severity: "warning",
      count: kpis.overpaymentCount,
      linkHref: "/payments?status=CONFIRMED",
      linkLabel: "Ver confirmados",
    });
  }

  // Info: dominant payment method
  const totalSplits = methodDistribution.reduce((s, m) => s + m.count, 0);
  if (totalSplits > 0 && methodDistribution.length > 0) {
    const top = methodDistribution[0];
    const pct = Math.round((top.count / totalSplits) * 100);
    if (pct >= 50) {
      const methodLabel = PAYMENT_METHOD_LABELS[top.method] ?? top.method;
      insights.push({
        id: "dominant-method",
        message: `${methodLabel} representa ${pct}% dos pagamentos registados.`,
        severity: "info",
        count: top.count,
      });
    }
  }

  // Info: wallet credit used this month
  if (kpis.walletCreditUsed > 0) {
    insights.push({
      id: "wallet-credit",
      message: `${kpis.walletCreditUsed.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT de crédito de carteira aplicado este mês.`,
      severity: "info",
    });
  }

  // Info: cancelled payments
  if (kpis.cancelledCount > 0) {
    insights.push({
      id: "cancelled",
      message: `${kpis.cancelledCount} ${kpis.cancelledCount === 1 ? "pagamento foi cancelado" : "pagamentos foram cancelados"}.`,
      severity: kpis.cancelledCount >= 5 ? "warning" : "info",
      count: kpis.cancelledCount,
      linkHref: "/payments?status=CANCELLED",
      linkLabel: "Ver cancelados",
    });
  }

  return insights;
}
