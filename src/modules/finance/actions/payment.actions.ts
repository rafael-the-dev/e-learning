"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/server/auth/context";
import { runAction } from "@/shared/lib/action";
import { RegisterPaymentCommand } from "@/modules/finance/commands/register-payment.command";
import { ConfirmPaymentCommand } from "@/modules/finance/commands/confirm-payment.command";
import { CancelPaymentCommand } from "@/modules/finance/commands/cancel-payment.command";
import type { RegisterPaymentInput, ConfirmPaymentInput, CancelPaymentInput } from "@/modules/finance/schemas/payment.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Payment } from "@/modules/finance/types";

export async function registerPaymentAction(input: RegisterPaymentInput): Promise<ActionResult<Payment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new RegisterPaymentCommand(input, context);
    const payment = await command.run();
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath("/student-wallets");
    if (input.invoiceId) revalidatePath(`/invoices/${input.invoiceId}`);
    return payment;
  });
}

export async function confirmPaymentAction(input: ConfirmPaymentInput): Promise<ActionResult<Payment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new ConfirmPaymentCommand(input, context);
    const payment = await command.run();
    revalidatePath("/payments");
    return payment;
  });
}

export async function cancelPaymentAction(input: CancelPaymentInput): Promise<ActionResult<Payment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CancelPaymentCommand(input, context);
    const payment = await command.run();
    revalidatePath("/payments");
    revalidatePath("/invoices");
    revalidatePath("/student-wallets");
    if (payment.invoiceId) revalidatePath(`/invoices/${payment.invoiceId}`);
    return payment;
  });
}
