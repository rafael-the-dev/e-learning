import {
  findInvoicesByOrganization,
  findInvoiceById,
  countInvoicesByStatus,
  findOpenInvoicesForPaymentForm,
  type ListInvoicesParams,
  type OpenInvoiceForPayment,
} from "@/modules/finance/repositories/invoice.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { Invoice } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getInvoicesByOrganization(
  organizationId: string,
  params: ListInvoicesParams
): Promise<PaginatedResult<Invoice>> {
  return findInvoicesByOrganization(organizationId, params);
}

export async function getInvoiceById(id: string, organizationId: string): Promise<Invoice> {
  const invoice = await findInvoiceById(id, organizationId);
  if (!invoice) throw new NotFoundError("Fatura", id);
  return invoice;
}

export async function getInvoiceStats(organizationId: string): Promise<Record<string, number>> {
  return countInvoicesByStatus(organizationId);
}

export async function getOpenInvoicesForPaymentForm(
  organizationId: string
): Promise<OpenInvoiceForPayment[]> {
  return findOpenInvoicesForPaymentForm(organizationId);
}
