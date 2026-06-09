import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { confirmPaymentSchema, type ConfirmPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { findWalletByStudentId } from "@/modules/wallets/repositories/wallet.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import type { Payment } from "@/modules/finance/types";
import type { StudentWallet } from "@/modules/wallets/types";

type DecimalLike = { toNumber(): number };

export class ConfirmPaymentCommand extends BaseCommand<ConfirmPaymentInput, Payment> {
  private existing: Payment | null = null;
  private wallet: StudentWallet | null = null;

  async validate(): Promise<void> {
    const result = confirmPaymentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findPaymentById(this.input.paymentId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Pagamento", this.input.paymentId);
    if (this.existing.status !== "PENDING") {
      throw new BusinessRuleError("Apenas pagamentos pendentes podem ser confirmados");
    }

    const walletCreditAmount = this.input.walletCreditAmount ?? 0;
    if (walletCreditAmount > 0) {
      if (!this.existing.studentId) {
        throw new BusinessRuleError("Crédito de carteira não pode ser aplicado sem aluno associado");
      }
      this.wallet = await findWalletByStudentId(this.existing.studentId, this.context.organizationId);
      if (!this.wallet) throw new BusinessRuleError("O aluno não tem uma carteira ativa");
      if (this.wallet.status === "SUSPENDED") throw new BusinessRuleError("Carteira suspensa");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CONFIRM)) throw new AuthorizationError();
  }

  async execute(): Promise<Payment> {
    const payment = this.existing!;
    const walletCreditApplied = this.input.walletCreditAmount ?? 0;
    const db = await getDb();

    // Captured inside transaction for post-transaction audit log
    let overpaymentResult = 0;
    let overpaymentWalletId: string | null = null;

    await db.$transaction(async (tx) => {
      // Re-read live invoice with items ordered by priority
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: payment.invoiceId!, organizationId: this.context.organizationId },
        select: {
          paidAmount: true,
          totalAmount: true,
          status: true,
          items: {
            select: { id: true, totalPrice: true, paidAmount: true, priority: true },
            orderBy: [{ priority: "asc" }, { id: "asc" }],
          },
        },
      });

      if (inv.status === "CANCELLED") {
        throw new BusinessRuleError("Não é possível confirmar um pagamento para uma fatura cancelada");
      }

      // Compute authoritative item balances (totalPrice - paidAmount, not the stored balanceAmount)
      const items = inv.items.map((item) => ({
        id: item.id,
        totalPrice: (item.totalPrice as DecimalLike).toNumber(),
        paidAmount: (item.paidAmount as DecimalLike).toNumber(),
        balance: (item.totalPrice as DecimalLike).toNumber() - (item.paidAmount as DecimalLike).toNumber(),
      })).filter((item) => item.balance > 0);

      const invoiceBalance = items.reduce((sum, item) => sum + item.balance, 0);

      if (walletCreditApplied > invoiceBalance) {
        throw new BusinessRuleError(
          `O crédito de carteira (${walletCreditApplied.toFixed(2)}) excede o saldo da fatura (${invoiceBalance.toFixed(2)})`
        );
      }

      // Re-check wallet balance inside transaction
      if (walletCreditApplied > 0) {
        const balanceResult = await tx.studentWalletTransaction.aggregate({
          where: { studentWalletId: this.wallet!.id },
          _sum: { amount: true },
        });
        const liveBalance = (balanceResult._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
        if (walletCreditApplied > liveBalance) {
          throw new BusinessRuleError(`Saldo insuficiente na carteira. Disponível: ${liveBalance.toFixed(2)}`);
        }
      }

      // Sum splits to get new money received
      const splitsSum = await tx.paymentSplit.aggregate({
        where: { paymentId: payment.id, organizationId: this.context.organizationId },
        _sum: { amount: true },
      });
      const newMoneyReceived = (splitsSum._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
      if (newMoneyReceived <= 0) {
        throw new BusinessRuleError("O pagamento não contém splits válidos");
      }

      // Allocation algorithm: wallet credit first, then new money — both by item priority
      const itemAllocs = new Map<string, { walletCredit: number; payment: number }>();
      for (const item of items) itemAllocs.set(item.id, { walletCredit: 0, payment: 0 });

      // Phase 1: allocate wallet credit to items by priority
      let walletRemaining = walletCreditApplied;
      for (const item of items) {
        if (walletRemaining <= 0) break;
        const alloc = Math.min(walletRemaining, item.balance);
        itemAllocs.get(item.id)!.walletCredit = alloc;
        walletRemaining -= alloc;
      }

      // Phase 2: allocate new money to remaining item balances by priority
      let newMoneyRemaining = newMoneyReceived;
      for (const item of items) {
        if (newMoneyRemaining <= 0) break;
        const walletUsed = itemAllocs.get(item.id)!.walletCredit;
        const remainingBalance = item.balance - walletUsed;
        if (remainingBalance <= 0) continue;
        const alloc = Math.min(newMoneyRemaining, remainingBalance);
        itemAllocs.get(item.id)!.payment = alloc;
        newMoneyRemaining -= alloc;
      }

      const overpayment = newMoneyRemaining;
      const totalNewMoneyApplied = newMoneyReceived - overpayment;
      const totalSettled = walletCreditApplied + totalNewMoneyApplied;

      // Wallet debit + CreditApplication
      let creditApplicationId: string | null = null;
      if (walletCreditApplied > 0) {
        const walletId = this.wallet!.id;
        await tx.studentWalletTransaction.create({
          data: {
            organizationId: this.context.organizationId,
            studentWalletId: walletId,
            type: "CREDIT_APPLIED",
            amount: -walletCreditApplied,
            referenceType: "Invoice",
            referenceId: payment.invoiceId!,
            description: `Crédito aplicado via pagamento ${payment.paymentNumber}`,
            createdBy: this.context.userId,
          },
        });
        const ca = await tx.creditApplication.create({
          data: {
            organizationId: this.context.organizationId,
            studentId: payment.studentId!,
            studentWalletId: walletId,
            invoiceId: payment.invoiceId!,
            paymentId: payment.id,
            amount: walletCreditApplied,
            createdBy: this.context.userId,
          },
          select: { id: true },
        });
        creditApplicationId = ca.id;
      }

      // Create PaymentAllocations and update InvoiceItems
      for (const item of items) {
        const alloc = itemAllocs.get(item.id)!;
        const totalApplied = alloc.walletCredit + alloc.payment;
        if (totalApplied === 0) continue;

        if (alloc.walletCredit > 0) {
          await tx.paymentAllocation.create({
            data: {
              organizationId: this.context.organizationId,
              paymentId: payment.id,
              creditApplicationId,
              invoiceId: payment.invoiceId!,
              invoiceItemId: item.id,
              amount: alloc.walletCredit,
              allocationType: "WALLET_CREDIT",
              createdBy: this.context.userId,
            },
          });
        }

        if (alloc.payment > 0) {
          await tx.paymentAllocation.create({
            data: {
              organizationId: this.context.organizationId,
              paymentId: payment.id,
              invoiceId: payment.invoiceId!,
              invoiceItemId: item.id,
              amount: alloc.payment,
              allocationType: "PAYMENT",
              createdBy: this.context.userId,
            },
          });
        }

        const newItemPaid = item.paidAmount + totalApplied;
        const newItemBalance = item.totalPrice - newItemPaid;
        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            paidAmount: newItemPaid,
            balanceAmount: newItemBalance,
            status: newItemBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          },
        });
      }

      // Update invoice totals (incremental — safe for mixed old/new data)
      const currentPaid = (inv.paidAmount as DecimalLike).toNumber();
      const invoiceTotal = (inv.totalAmount as DecimalLike).toNumber();
      const newPaid = currentPaid + totalSettled;
      const newBalance = invoiceTotal - newPaid;
      await tx.invoice.update({
        where: { id: payment.invoiceId!, organizationId: this.context.organizationId },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "PAID" : newPaid > 0 ? "PARTIALLY_PAID" : "PENDING",
        },
      });

      // Overpayment: credit excess new money to wallet
      if (overpayment > 0 && payment.studentId) {
        let walletId = this.wallet?.id;
        if (!walletId) {
          const existing = await tx.studentWallet.findFirst({
            where: { organizationId: this.context.organizationId, studentId: payment.studentId },
            select: { id: true },
          });
          if (existing) {
            walletId = existing.id;
          } else {
            const created = await tx.studentWallet.create({
              data: {
                organizationId: this.context.organizationId,
                studentId: payment.studentId,
                status: "ACTIVE",
                createdBy: this.context.userId,
              },
              select: { id: true },
            });
            walletId = created.id;
          }
        }
        await tx.studentWalletTransaction.create({
          data: {
            organizationId: this.context.organizationId,
            studentWalletId: walletId,
            type: "OVERPAYMENT",
            amount: overpayment,
            referenceType: "Payment",
            referenceId: payment.id,
            description: "Excesso de pagamento creditado na carteira",
            createdBy: this.context.userId,
          },
        });
        // Capture for post-transaction audit log
        overpaymentResult = overpayment;
        overpaymentWalletId = walletId;
      }

      // Update installment balance
      if (payment.installmentId) {
        const inst = await tx.installment.findUniqueOrThrow({
          where: { id: payment.installmentId },
          select: { paidAmount: true, amount: true },
        });
        const newInstPaid = (inst.paidAmount as DecimalLike).toNumber() + totalNewMoneyApplied;
        const newInstBalance = (inst.amount as DecimalLike).toNumber() - newInstPaid;
        await tx.installment.update({
          where: { id: payment.installmentId },
          data: {
            paidAmount: newInstPaid,
            balanceAmount: newInstBalance,
            status: newInstBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          },
        });
      }

      // Mark payment CONFIRMED
      await tx.payment.update({
        where: { id: payment.id, organizationId: this.context.organizationId },
        data: { status: "CONFIRMED" },
      });
    });

    const updated = await findPaymentById(payment.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar pagamento após confirmação");

    await auditService.log(this.context, {
      entity: "Payment",
      entityId: updated.id,
      action: "payment.confirmed",
      oldValues: { status: "PENDING" },
      newValues: {
        status: "CONFIRMED",
        walletCreditApplied: walletCreditApplied > 0 ? walletCreditApplied : undefined,
      },
    });

    if (walletCreditApplied > 0) {
      await auditService.log(this.context, {
        entity: "StudentWallet",
        entityId: this.wallet!.id,
        action: "wallet.credit_applied",
        newValues: {
          amount: walletCreditApplied,
          invoiceId: payment.invoiceId,
          paymentId: payment.id,
        },
      });
    }

    if (overpaymentResult > 0 && overpaymentWalletId) {
      await auditService.log(this.context, {
        entity: "StudentWallet",
        entityId: overpaymentWalletId,
        action: "wallet.overpayment",
        newValues: {
          amount: overpaymentResult,
          paymentId: payment.id,
          studentId: payment.studentId,
        },
      });
    }

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.PAYMENT_CONFIRMED,
      aggregateType: DomainAggregateType.PAYMENT,
      aggregateId: updated.id,
      actorId: this.context.userId,
      payload: {
        paymentId: updated.id,
        invoiceId: updated.invoiceId ?? undefined,
        studentId: updated.studentId ?? undefined,
        enrollmentId: updated.enrollmentId ?? undefined,
        walletCreditApplied: walletCreditApplied > 0 ? walletCreditApplied : undefined,
        overpayment: overpaymentResult > 0 ? overpaymentResult : undefined,
        confirmedAt: new Date().toISOString(),
      },
    });

    return updated;
  }
}
