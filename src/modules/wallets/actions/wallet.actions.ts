"use server";

import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/server/auth/context";
import { runAction } from "@/shared/lib/action";
import { CreateWalletCommand } from "@/modules/wallets/commands/create-wallet.command";
import { CreateDepositCommand } from "@/modules/wallets/commands/create-deposit.command";
import { ApplyWalletCreditCommand } from "@/modules/wallets/commands/apply-wallet-credit.command";
import { CreateWalletAdjustmentCommand } from "@/modules/wallets/commands/create-wallet-adjustment.command";
import { RefundWalletCommand } from "@/modules/wallets/commands/refund-wallet.command";
import { ProcessOverpaymentCommand } from "@/modules/wallets/commands/process-overpayment.command";
import type {
  CreateWalletInput,
  CreateDepositInput,
  ApplyWalletCreditInput,
  CreateWalletAdjustmentInput,
  RefundWalletInput,
  ProcessOverpaymentInput,
} from "@/modules/wallets/schemas/wallet.schema";
import type { ActionResult } from "@/shared/types/common";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

export async function createWalletAction(input: CreateWalletInput): Promise<ActionResult<StudentWallet>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const wallet = await new CreateWalletCommand(input, context).run();
    revalidatePath("/student-wallets");
    revalidatePath(`/students/${input.studentId}`);
    return wallet;
  });
}

export async function createDepositAction(input: CreateDepositInput): Promise<ActionResult<WalletTransaction>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const tx = await new CreateDepositCommand(input, context).run();
    revalidatePath(`/student-wallets/${input.walletId}`);
    revalidatePath("/student-wallets");
    return tx;
  });
}

export async function applyWalletCreditAction(input: ApplyWalletCreditInput): Promise<ActionResult<StudentWallet>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const wallet = await new ApplyWalletCreditCommand(input, context).run();
    revalidatePath(`/student-wallets/${input.walletId}`);
    revalidatePath("/student-wallets");
    revalidatePath("/invoices");
    if (input.invoiceId) revalidatePath(`/invoices/${input.invoiceId}`);
    return wallet;
  });
}

export async function createWalletAdjustmentAction(
  input: CreateWalletAdjustmentInput
): Promise<ActionResult<WalletTransaction>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const tx = await new CreateWalletAdjustmentCommand(input, context).run();
    revalidatePath(`/student-wallets/${input.walletId}`);
    revalidatePath("/student-wallets");
    return tx;
  });
}

export async function refundWalletAction(input: RefundWalletInput): Promise<ActionResult<WalletTransaction>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const tx = await new RefundWalletCommand(input, context).run();
    revalidatePath(`/student-wallets/${input.walletId}`);
    revalidatePath("/student-wallets");
    return tx;
  });
}

export async function processOverpaymentAction(
  input: ProcessOverpaymentInput
): Promise<ActionResult<StudentWallet>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const wallet = await new ProcessOverpaymentCommand(input, context).run();
    revalidatePath("/student-wallets");
    revalidatePath(`/students/${input.studentId}`);
    return wallet;
  });
}
