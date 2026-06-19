import type { PaymentMethodMixFilters, PaymentMethodMixReport } from "../types";
import {
  getPaymentMethodRows,
  getPaymentMethodMonthlyTrend,
  getPaymentMethodByBranch,
  hasCriticalPaymentMethodIntegrityIssue,
  computePaymentMethodKPIs,
} from "../repositories/payment-method.repository";

export async function getPaymentMethodMixReport(
  filters: PaymentMethodMixFilters
): Promise<PaymentMethodMixReport> {
  const [rows, monthlyTrend, byBranch, hasCriticalIntegrityIssue] = await Promise.all([
    getPaymentMethodRows(filters),
    getPaymentMethodMonthlyTrend(filters),
    getPaymentMethodByBranch(filters),
    hasCriticalPaymentMethodIntegrityIssue(filters.organizationId),
  ]);

  return {
    kpis: computePaymentMethodKPIs(rows),
    rows,
    monthlyTrend,
    byBranch,
    hasCriticalIntegrityIssue,
  };
}
