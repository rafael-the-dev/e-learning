"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/server/auth/context";
import { runAction } from "@/shared/lib/action";
import { CreateInvoiceCommand } from "@/modules/finance/commands/create-invoice.command";
import { UpdateInvoiceCommand } from "@/modules/finance/commands/update-invoice.command";
import { CancelInvoiceCommand } from "@/modules/finance/commands/cancel-invoice.command";
import type { CreateInvoiceInput, UpdateInvoiceInput, CancelInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Invoice } from "@/modules/finance/types";

export async function createInvoiceAction(input: CreateInvoiceInput): Promise<ActionResult<Invoice>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CreateInvoiceCommand(input, context);
    const invoice = await command.run();
    revalidatePath("/invoices");
    return invoice;
  });
}

export async function updateInvoiceAction(input: UpdateInvoiceInput): Promise<ActionResult<Invoice>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new UpdateInvoiceCommand(input, context);
    const invoice = await command.run();
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    return invoice;
  });
}

export async function cancelInvoiceAction(input: CancelInvoiceInput): Promise<ActionResult<Invoice>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CancelInvoiceCommand(input, context);
    const invoice = await command.run();
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    return invoice;
  });
}
