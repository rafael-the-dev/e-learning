import {
  getPaymentDashboardKPIs,
  getPaymentStatusDistribution,
  getPaymentMethodDistribution,
  getPaymentMonthlyTrend,
  getPaymentBranchDistribution,
} from "@/modules/finance/repositories/payment-dashboard.repository";
import type {
  PaymentDashboardKPIs,
  PaymentMethodDistribution,
  PaymentStatusDistribution,
  PaymentMonthlyTrend,
  PaymentBranchDistribution,
} from "@/modules/finance/types";

export async function getPaymentKPIs(organizationId: string): Promise<PaymentDashboardKPIs> {
  return getPaymentDashboardKPIs(organizationId);
}

export async function getPaymentMethodStats(
  organizationId: string
): Promise<PaymentMethodDistribution[]> {
  return getPaymentMethodDistribution(organizationId);
}

export async function getPaymentStatusStats(
  organizationId: string
): Promise<PaymentStatusDistribution[]> {
  return getPaymentStatusDistribution(organizationId);
}

export async function getPaymentTrend(
  organizationId: string,
  months = 6
): Promise<PaymentMonthlyTrend[]> {
  return getPaymentMonthlyTrend(organizationId, months);
}

export async function getPaymentBranchStats(
  organizationId: string
): Promise<PaymentBranchDistribution[]> {
  return getPaymentBranchDistribution(organizationId);
}
