import {
  getInvoiceDashboardKPIs,
  getInvoiceStatusDistribution,
  getInvoiceCourseDistribution,
  getInvoiceMonthlyTrend,
  getInvoiceAgingBuckets,
} from "@/modules/finance/repositories/invoice-dashboard.repository";
import type {
  InvoiceDashboardKPIs,
  InvoiceStatusDistribution,
  InvoiceCourseDistribution,
  InvoiceMonthlyTrend,
  InvoiceAgingBucket,
} from "@/modules/finance/types";

export async function getInvoiceKPIs(organizationId: string): Promise<InvoiceDashboardKPIs> {
  return getInvoiceDashboardKPIs(organizationId);
}

export async function getInvoiceStatusStats(
  organizationId: string
): Promise<InvoiceStatusDistribution[]> {
  return getInvoiceStatusDistribution(organizationId);
}

export async function getInvoiceCourseStats(
  organizationId: string
): Promise<InvoiceCourseDistribution[]> {
  return getInvoiceCourseDistribution(organizationId);
}

export async function getInvoiceTrend(
  organizationId: string,
  months = 6
): Promise<InvoiceMonthlyTrend[]> {
  return getInvoiceMonthlyTrend(organizationId, months);
}

export async function getInvoiceAging(
  organizationId: string
): Promise<InvoiceAgingBucket[]> {
  return getInvoiceAgingBuckets(organizationId);
}
