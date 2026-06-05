import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { applyWalletCreditSchema, type ApplyWalletCreditInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById, getWalletBalance } from "@/modules/wallets/repositories/wallet.repository";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { StudentWallet } from "@/modules/wallets/types";

export class ApplyWalletCreditCommand extends BaseCommand<ApplyWalletCreditInput, StudentWallet> {
  private wallet: StudentWallet | null = null;

  async validate(): Promise<void> {
    const result = applyWalletCreditSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.wallet = await findWalletById(this.input.walletId, this.context.organizationId);
    if (!this.wallet) throw new NotFoundError("Carteira", this.input.walletId);
    if (this.wallet.status === "SUSPENDED") throw new BusinessRuleError("Carteira suspensa");

    const invoice = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!invoice) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (invoice.status === "CANCELLED") throw new BusinessRuleError("Fatura cancelada");
    if (invoice.status === "PAID") throw new BusinessRuleError("Fatura já está totalmente paga");

    if (invoice.studentId !== this.wallet.studentId) {
      throw new BusinessRuleError("O crédito só pode ser aplicado a faturas do mesmo aluno");
    }

    if (this.input.amount > invoice.balanceAmount) {
      throw new BusinessRuleError(
        `O crédito (${this.input.amount}) excede o saldo da fatura (${invoice.balanceAmount})`
      );
    }

    const balance = await getWalletBalance(this.input.walletId);
    if (this.input.amount > balance) {
      throw new BusinessRuleError(
        `Saldo insuficiente na carteira. Disponível: ${balance.toFixed(2)}`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.WALLET_TRANSACTIONS_APPLY_CREDIT)) throw new AuthorizationError();
  }

  async execute(): Promise<StudentWallet> {
    const wallet = this.wallet!;
    const db = await getDb();

    await db.$transaction(async (tx) => {
      // Re-check balance inside the transaction to guard against concurrent debits
      const balanceResult = await tx.studentWalletTransaction.aggregate({
        where: { studentWalletId: wallet.id },
        _sum: { amount: true },
      });
      const liveBalance = (balanceResult._sum.amount as { toNumber(): number } | null)?.toNumber() ?? 0;
      if (this.input.amount > liveBalance) {
        throw new BusinessRuleError(`Saldo insuficiente na carteira. Disponível: ${liveBalance.toFixed(2)}`);
      }

      // Debit wallet (negative amount = money leaves wallet)
      await tx.studentWalletTransaction.create({
        data: {
          organizationId: this.context.organizationId,
          studentWalletId: wallet.id,
          type: "CREDIT_APPLIED",
          amount: -this.input.amount,
          referenceType: "Invoice",
          referenceId: this.input.invoiceId,
          description: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
      });

      // Record credit application
      await tx.creditApplication.create({
        data: {
          organizationId: this.context.organizationId,
          studentId: wallet.studentId,
          studentWalletId: wallet.id,
          invoiceId: this.input.invoiceId,
          amount: this.input.amount,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
      });

      // Update invoice
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: this.input.invoiceId },
        select: { paidAmount: true, totalAmount: true },
      });
      const newPaid = Number(inv.paidAmount) + this.input.amount;
      const newBalance = Number(inv.totalAmount) - newPaid;
      await tx.invoice.update({
        where: { id: this.input.invoiceId },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
        },
      });
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: wallet.id,
      action: "wallet.credit_applied",
      newValues: {
        amount: this.input.amount,
        invoiceId: this.input.invoiceId,
        studentId: wallet.studentId,
      },
    });

    const updated = await findWalletById(wallet.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar carteira");
    return updated;
  }
}
