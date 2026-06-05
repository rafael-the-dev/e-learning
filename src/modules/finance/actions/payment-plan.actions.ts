"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/server/auth/context";
import { runAction } from "@/shared/lib/action";
import { CreatePaymentPlanCommand } from "@/modules/finance/commands/create-payment-plan.command";
import { UpdatePaymentPlanCommand } from "@/modules/finance/commands/update-payment-plan.command";
import { CancelPaymentPlanCommand } from "@/modules/finance/commands/cancel-payment-plan.command";
import type { CreatePaymentPlanInput, UpdatePaymentPlanInput, CancelPaymentPlanInput } from "@/modules/finance/schemas/payment-plan.schema";
import type { ActionResult } from "@/shared/types/common";
import type { PaymentPlan } from "@/modules/finance/types";

export async function createPaymentPlanAction(input: CreatePaymentPlanInput): Promise<ActionResult<PaymentPlan>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CreatePaymentPlanCommand(input, context);
    const plan = await command.run();
    revalidatePath(`/invoices/${input.invoiceId}`);
    return plan;
  });
}

export async function updatePaymentPlanAction(input: UpdatePaymentPlanInput): Promise<ActionResult<PaymentPlan>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new UpdatePaymentPlanCommand(input, context);
    const plan = await command.run();
    revalidatePath("/invoices");
    return plan;
  });
}

export async function cancelPaymentPlanAction(input: CancelPaymentPlanInput): Promise<ActionResult<PaymentPlan>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CancelPaymentPlanCommand(input, context);
    const plan = await command.run();
    revalidatePath("/invoices");
    return plan;
  });
}
