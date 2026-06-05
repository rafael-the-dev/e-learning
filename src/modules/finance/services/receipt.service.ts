import {
  findReceiptsByOrganization,
  findReceiptById,
  countReceiptsByStatus,
  type ListReceiptsParams,
} from "@/modules/finance/repositories/receipt.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { Receipt } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";

export async function getReceiptsByOrganization(
  organizationId: string,
  params: ListReceiptsParams
): Promise<PaginatedResult<Receipt>> {
  return findReceiptsByOrganization(organizationId, params);
}

export async function getReceiptById(id: string, organizationId: string): Promise<Receipt> {
  const receipt = await findReceiptById(id, organizationId);
  if (!receipt) throw new NotFoundError("Recibo", id);
  return receipt;
}

export async function getReceiptStats(organizationId: string): Promise<Record<string, number>> {
  return countReceiptsByStatus(organizationId);
}
