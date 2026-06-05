import {
  findPaymentPlanByInvoice,
  findPaymentPlanById,
} from "@/modules/finance/repositories/payment-plan.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { PaymentPlan } from "@/modules/finance/types";

export async function getPaymentPlanByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<PaymentPlan | null> {
  return findPaymentPlanByInvoice(invoiceId, organizationId);
}

export async function getPaymentPlanById(
  id: string,
  organizationId: string
): Promise<PaymentPlan> {
  const plan = await findPaymentPlanById(id, organizationId);
  if (!plan) throw new NotFoundError("Plano de pagamento", id);
  return plan;
}
