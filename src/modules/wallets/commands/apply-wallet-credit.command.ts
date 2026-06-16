import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { applyWalletCreditSchema, type ApplyWalletCreditInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById, getWalletBalance } from "@/modules/wallets/repositories/wallet.repository";
import { lockAndGetWalletBalance } from "@/modules/wallets/services/wallet-concurrency.service";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { recordCreditApplied } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import type { StudentWallet } from "@/modules/wallets/types";

type DecimalLike = { toNumber(): number };

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
      // Lock the wallet row and re-read the authoritative ledger balance.
      // Blocks any concurrent debit on this wallet until we commit.
      const { balance: liveBalance } = await lockAndGetWalletBalance(
        tx,
        wallet.id,
        this.context.organizationId
      );
      if (this.input.amount > liveBalance) {
        throw new BusinessRuleError(`Saldo insuficiente na carteira. Disponível: ${liveBalance.toFixed(2)}`);
      }

      // Debit wallet
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

      // Record CreditApplication (no paymentId — standalone credit)
      const ca = await tx.creditApplication.create({
        data: {
          organizationId: this.context.organizationId,
          studentId: wallet.studentId,
          studentWalletId: wallet.id,
          invoiceId: this.input.invoiceId,
          amount: this.input.amount,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
        select: { id: true },
      });

      // Re-validate invoice balance inside the transaction (guard against concurrent payments)
      const invCheck = await tx.invoice.findUniqueOrThrow({
        where: { id: this.input.invoiceId, organizationId: this.context.organizationId },
        select: { balanceAmount: true, status: true },
      });
      const liveInvoiceBalance = (invCheck.balanceAmount as DecimalLike).toNumber();
      if (invCheck.status === "CANCELLED") {
        throw new BusinessRuleError("Fatura cancelada");
      }
      if (this.input.amount > liveInvoiceBalance) {
        throw new BusinessRuleError(
          `O saldo da fatura foi alterado. Disponível: ${liveInvoiceBalance.toFixed(2)}`
        );
      }

      // Allocate credit to invoice items by priority
      const items = await tx.invoiceItem.findMany({
        where: { invoiceId: this.input.invoiceId },
        select: { id: true, totalPrice: true, paidAmount: true, priority: true },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
      });

      let remaining = this.input.amount;
      let totalAllocated = 0;
      for (const item of items) {
        if (remaining <= 0) break;
        const balance = (item.totalPrice as DecimalLike).toNumber() - (item.paidAmount as DecimalLike).toNumber();
        if (balance <= 0) continue;
        const alloc = Math.min(remaining, balance);

        await tx.paymentAllocation.create({
          data: {
            organizationId: this.context.organizationId,
            creditApplicationId: ca.id,
            invoiceId: this.input.invoiceId,
            invoiceItemId: item.id,
            amount: alloc,
            allocationType: "WALLET_CREDIT",
            createdBy: this.context.userId,
          },
        });

        const newPaid = (item.paidAmount as DecimalLike).toNumber() + alloc;
        const newBalance = (item.totalPrice as DecimalLike).toNumber() - newPaid;
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          },
        });

        totalAllocated += alloc;
        remaining -= alloc;
      }

      // Update invoice totals using the amount actually allocated to items.
      // This keeps invoice.paidAmount consistent with sum(item.paidAmount).
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: this.input.invoiceId },
        select: { paidAmount: true, totalAmount: true },
      });
      const newPaid = (inv.paidAmount as DecimalLike).toNumber() + totalAllocated;
      const newBalance = (inv.totalAmount as DecimalLike).toNumber() - newPaid;
      await tx.invoice.update({
        where: { id: this.input.invoiceId },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
        },
      });

      // Ledger entry — wallet credit applied to settle invoice balance
      await recordCreditApplied(tx, this.context.organizationId, {
        sourceId: ca.id,
        amount: totalAllocated,
        invoiceId: this.input.invoiceId,
        studentId: wallet.studentId,
        description: this.input.notes ?? `Crédito de carteira aplicado à fatura`,
        actorId: this.context.userId,
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

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.WALLET_CREDIT_APPLIED,
      entityType: "StudentWallet",
      entityId: wallet.id,
      amount: this.input.amount,
      metadata: {
        invoiceId: this.input.invoiceId,
        studentId: wallet.studentId,
        notes: this.input.notes ?? null,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.WALLET_CREDIT_APPLIED,
      aggregateType: DomainAggregateType.WALLET,
      aggregateId: wallet.id,
      actorId: this.context.userId,
      payload: {
        walletId: wallet.id,
        studentId: wallet.studentId,
        invoiceId: this.input.invoiceId,
        amount: this.input.amount,
      },
    });

    const updated = await findWalletById(wallet.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar carteira");
    return updated;
  }
}
