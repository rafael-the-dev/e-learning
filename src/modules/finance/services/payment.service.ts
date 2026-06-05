import {
  findPaymentsByOrganization,
  findPaymentById,
  countPaymentsByStatus,
  type ListPaymentsParams,
} from "@/modules/finance/repositories/payment.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { Payment } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getPaymentsByOrganization(
  organizationId: string,
  params: ListPaymentsParams
): Promise<PaginatedResult<Payment>> {
  return findPaymentsByOrganization(organizationId, params);
}

export async function getPaymentById(id: string, organizationId: string): Promise<Payment> {
  const payment = await findPaymentById(id, organizationId);
  if (!payment) throw new NotFoundError("Pagamento", id);
  return payment;
}

export async function getPaymentStats(organizationId: string): Promise<Record<string, number>> {
  return countPaymentsByStatus(organizationId);
}
