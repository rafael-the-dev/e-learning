"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/server/auth/context";
import { runAction } from "@/shared/lib/action";
import { IssueReceiptCommand } from "@/modules/finance/commands/issue-receipt.command";
import { CancelReceiptCommand } from "@/modules/finance/commands/cancel-receipt.command";
import type { IssueReceiptInput, CancelReceiptInput } from "@/modules/finance/schemas/receipt.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Receipt } from "@/modules/finance/types";

export async function issueReceiptAction(input: IssueReceiptInput): Promise<ActionResult<Receipt>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new IssueReceiptCommand(input, context);
    const receipt = await command.run();
    revalidatePath("/receipts");
    revalidatePath("/payments");
    return receipt;
  });
}

export async function cancelReceiptAction(input: CancelReceiptInput): Promise<ActionResult<Receipt>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const command = new CancelReceiptCommand(input, context);
    const receipt = await command.run();
    revalidatePath("/receipts");
    revalidatePath(`/receipts/${input.receiptId}`);
    return receipt;
  });
}
