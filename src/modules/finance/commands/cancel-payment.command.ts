import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelPaymentSchema, type CancelPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import {
  recalculateInstallmentAfterPaymentCancellation,
  type InstallmentRecalculationResult,
} from "@/modules/finance/services/installment-recalculation.service";
import {
  cancelReceiptForPayment,
  type ReceiptCancellationResult,
} from "@/modules/finance/services/receipt-cancellation.service";
import { computeInvoiceStatusOnReversal } from "@/modules/finance/utils/status-computation";
import { lockAndGetWalletBalance } from "@/modules/wallets/services/wallet-concurrency.service";
import {
  recordPaymentCancelled,
  recordWalletCredit,
  recordWalletDebit,
} from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import type { Payment } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

export class CancelPaymentCommand extends BaseCommand<CancelPaymentInput, Payment> {
  private existing: Payment | null = null;

  async validate(): Promise<void> {
    const result = cancelPaymentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findPaymentById(this.input.paymentId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Pagamento", this.input.paymentId);
    if (this.existing.status === "CANCELLED") throw new BusinessRuleError("Pagamento já está cancelado");
    if (this.existing.status === "REFUNDED") throw new BusinessRuleError("Pagamento já foi reembolsado");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CANCEL)) throw new AuthorizationError();
  }

  async execute(): Promise<Payment> {
    const existing = this.existing!;
    const db = await getDb();

    if (existing.status === "PENDING") {
      await db.payment.update({
        where: { id: existing.id, organizationId: this.context.organizationId },
        data: { status: "CANCELLED" },
      });
    }

    // CONFIRMED — reverse all financial effects atomically.
    // The transaction returns structured results (installment + receipt) so that
    // TypeScript's control-flow analysis can track types outside the closure.
    const txResult =
      existing.status !== "CONFIRMED"
        ? null
        : await db.$transaction(async (tx) => {
            // Load all allocations for this payment
            const allocations = await tx.paymentAllocation.findMany({
              where: { paymentId: existing.id, organizationId: this.context.organizationId },
              select: { id: true, invoiceItemId: true, amount: true, allocationType: true, creditApplicationId: true },
            });

            const walletCreditAllocs = allocations.filter((a) => a.allocationType === "WALLET_CREDIT");
            const totalApplied = allocations.reduce((sum, a) => sum + (a.amount as DecimalLike).toNumber(), 0);

            // 1. Reverse wallet credit applications linked to this payment
            if (walletCreditAllocs.length > 0) {
              const creditApps = await tx.creditApplication.findMany({
                where: { paymentId: existing.id, organizationId: this.context.organizationId },
                select: { id: true, studentWalletId: true, amount: true },
              });
              for (const ca of creditApps) {
                const caAmount = (ca.amount as DecimalLike).toNumber();
                const reversalTx = await tx.studentWalletTransaction.create({
                  data: {
                    organizationId: this.context.organizationId,
                    studentWalletId: ca.studentWalletId,
                    type: "ADJUSTMENT",
                    amount: caAmount,
                    referenceType: "Payment",
                    referenceId: existing.id,
                    description: `Crédito revertido — cancelamento do pagamento ${existing.paymentNumber}`,
                    createdBy: this.context.userId,
                  },
                  select: { id: true },
                });
                // Restoring wallet balance = wallet liability increases = WALLET_CREDIT
                await recordWalletCredit(tx, this.context.organizationId, {
                  sourceId: reversalTx.id,
                  amount: caAmount,
                  studentId: existing.studentId,
                  description: `Crédito revertido — cancelamento do pagamento ${existing.paymentNumber}`,
                  actorId: this.context.userId,
                });
              }
            }

            // 2. Reverse overpayment credit if present.
            // Lock the wallet row first to prevent concurrent debits spending the balance
            // between our balance check and the reversal write.
            const overpaymentTx = await tx.studentWalletTransaction.findFirst({
              where: {
                organizationId: this.context.organizationId,
                referenceType: "Payment",
                referenceId: existing.id,
                type: "OVERPAYMENT",
              },
              select: { id: true, studentWalletId: true, amount: true },
            });
            if (overpaymentTx) {
              const overpaymentAmount = (overpaymentTx.amount as DecimalLike).toNumber();
              const { balance: currentBalance } = await lockAndGetWalletBalance(
                tx,
                overpaymentTx.studentWalletId,
                this.context.organizationId
              );
              if (currentBalance < overpaymentAmount) {
                throw new BusinessRuleError(
                  `Não é possível cancelar este pagamento. O excesso de ${overpaymentAmount.toFixed(2)} foi parcialmente utilizado (saldo atual: ${currentBalance.toFixed(2)})`
                );
              }
              const clawbackTx = await tx.studentWalletTransaction.create({
                data: {
                  organizationId: this.context.organizationId,
                  studentWalletId: overpaymentTx.studentWalletId,
                  type: "ADJUSTMENT",
                  amount: -overpaymentAmount,
                  referenceType: "Payment",
                  referenceId: existing.id,
                  description: `Excesso revertido — cancelamento do pagamento ${existing.paymentNumber}`,
                  createdBy: this.context.userId,
                },
                select: { id: true },
              });
              // Clawing back overpayment credit = wallet liability decreases = WALLET_DEBIT
              await recordWalletDebit(tx, this.context.organizationId, {
                sourceId: clawbackTx.id,
                amount: overpaymentAmount,
                studentId: existing.studentId,
                description: `Excesso revertido — cancelamento do pagamento ${existing.paymentNumber}`,
                actorId: this.context.userId,
              });
            }

            // 3. Reverse InvoiceItem paidAmounts grouped by item
            if (allocations.length > 0) {
              const reversalByItem = new Map<string, number>();
              for (const alloc of allocations) {
                const prev = reversalByItem.get(alloc.invoiceItemId) ?? 0;
                reversalByItem.set(alloc.invoiceItemId, prev + (alloc.amount as DecimalLike).toNumber());
              }
              for (const [itemId, reversalAmount] of reversalByItem) {
                const item = await tx.invoiceItem.findUniqueOrThrow({
                  where: { id: itemId },
                  select: { totalPrice: true, paidAmount: true },
                });
                const newPaid = Math.max(0, (item.paidAmount as DecimalLike).toNumber() - reversalAmount);
                const newBalance = (item.totalPrice as DecimalLike).toNumber() - newPaid;
                await tx.invoiceItem.update({
                  where: { id: itemId },
                  data: {
                    paidAmount: newPaid,
                    balanceAmount: newBalance,
                    status: newPaid <= 0 ? "PENDING" : "PARTIALLY_PAID",
                  },
                });
              }
            }

            // 4. Reverse invoice balance — preserve OVERDUE if the invoice was
            //    already overdue or its dueDate is in the past.
            if (existing.invoiceId && totalApplied > 0) {
              const inv = await tx.invoice.findUniqueOrThrow({
                where: { id: existing.invoiceId, organizationId: this.context.organizationId },
                select: { paidAmount: true, totalAmount: true, status: true, dueDate: true },
              });
              const newPaid = Math.max(0, (inv.paidAmount as DecimalLike).toNumber() - totalApplied);
              const newBalance = (inv.totalAmount as DecimalLike).toNumber() - newPaid;
              await tx.invoice.update({
                where: { id: existing.invoiceId, organizationId: this.context.organizationId },
                data: {
                  paidAmount: newPaid,
                  balanceAmount: newBalance,
                  status: computeInvoiceStatusOnReversal(
                    inv.status,
                    newBalance,
                    newPaid,
                    inv.dueDate as Date | null
                  ),
                },
              });
            }

            // 5. Reverse installment paidAmount/balanceAmount/status.
            // Only PAYMENT-type allocations are credited to installment.paidAmount during
            // confirmation; wallet-credit allocations are not. Reversal must match exactly.
            let recalcResult: InstallmentRecalculationResult | null = null;
            if (existing.installmentId) {
              const installmentReversalAmount = allocations
                .filter((a) => a.allocationType === "PAYMENT")
                .reduce((sum, a) => sum + (a.amount as DecimalLike).toNumber(), 0);
              if (installmentReversalAmount > 0) {
                recalcResult = await recalculateInstallmentAfterPaymentCancellation(
                  tx,
                  existing.installmentId,
                  this.context.organizationId,
                  installmentReversalAmount
                );
              }
            }

            // 6. Mark payment cancelled
            await tx.payment.update({
              where: { id: existing.id, organizationId: this.context.organizationId },
              data: { status: "CANCELLED" },
            });

            // 7. Cancel the issued receipt linked to this payment.
            // Runs inside the same transaction: if receipt cancellation fails,
            // the payment cancellation is rolled back too.
            const receiptResult = await cancelReceiptForPayment(
              tx,
              existing.id,
              this.context.organizationId,
              this.context.userId,
              this.input.reason ?? null
            );

            // 8. Ledger entry — records the cash-flow reversal
            await recordPaymentCancelled(tx, this.context.organizationId, {
              paymentId: existing.id,
              paymentNumber: existing.paymentNumber,
              amount: existing.totalAmount,
              invoiceId: existing.invoiceId,
              studentId: existing.studentId,
              enrollmentId: existing.enrollmentId,
              actorId: this.context.userId,
            });

            return { recalcResult, receiptResult };
          });

    const installmentRecalcResult: InstallmentRecalculationResult | null = txResult?.recalcResult ?? null;
    const receiptCancelResult: ReceiptCancellationResult | null = txResult?.receiptResult ?? null;

    const updated = await findPaymentById(existing.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar pagamento após cancelamento");

    await auditService.log(this.context, {
      entity: "Payment",
      entityId: updated.id,
      action: "payment.cancelled",
      oldValues: { status: existing.status },
      newValues: {
        status: "CANCELLED",
        reason: this.input.reason,
      },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.PAYMENT_CANCELLED,
      entityType: "Payment",
      entityId: updated.id,
      amount: existing.totalAmount,
      beforeData: { status: existing.status },
      afterData: { status: "CANCELLED", reason: this.input.reason ?? null },
      metadata: {
        paymentNumber: existing.paymentNumber,
        invoiceId: existing.invoiceId ?? null,
        studentId: existing.studentId ?? null,
        enrollmentId: existing.enrollmentId ?? null,
      },
    });

    if (installmentRecalcResult) {
      await auditService.log(this.context, {
        entity: "Installment",
        entityId: installmentRecalcResult.installmentId,
        action: "installment.recalculated",
        oldValues: {
          paidAmount: installmentRecalcResult.oldPaidAmount,
          balanceAmount: installmentRecalcResult.oldBalanceAmount,
          status: installmentRecalcResult.oldStatus,
        },
        newValues: {
          paidAmount: installmentRecalcResult.newPaidAmount,
          balanceAmount: installmentRecalcResult.newBalanceAmount,
          status: installmentRecalcResult.newStatus,
        },
      });
      await financialAuditService.log(this.context, {
        eventType: FinancialAuditEventType.INSTALLMENT_RECALCULATED,
        entityType: "Installment",
        entityId: installmentRecalcResult.installmentId,
        beforeData: {
          paidAmount: installmentRecalcResult.oldPaidAmount,
          balanceAmount: installmentRecalcResult.oldBalanceAmount,
          status: installmentRecalcResult.oldStatus,
        },
        afterData: {
          paidAmount: installmentRecalcResult.newPaidAmount,
          balanceAmount: installmentRecalcResult.newBalanceAmount,
          status: installmentRecalcResult.newStatus,
        },
        metadata: { paymentId: existing.id, paymentNumber: existing.paymentNumber },
      });
    }

    if (receiptCancelResult) {
      await auditService.log(this.context, {
        entity: "Receipt",
        entityId: receiptCancelResult.receiptId,
        action: "receipt.cancelled",
        oldValues: {
          status: receiptCancelResult.previousStatus,
        },
        newValues: {
          status: "CANCELLED",
          receiptNumber: receiptCancelResult.receiptNumber,
          paymentId: existing.id,
          paymentNumber: existing.paymentNumber,
          cancelledBy: this.context.userId,
          cancelledAt: receiptCancelResult.cancelledAt.toISOString(),
          reason: this.input.reason ?? null,
        },
      });

      await eventPublisher.publish({
        organizationId: this.context.organizationId,
        eventType: DomainEventType.RECEIPT_CANCELLED,
        aggregateType: DomainAggregateType.RECEIPT,
        aggregateId: receiptCancelResult.receiptId,
        actorId: this.context.userId,
        payload: {
          receiptId: receiptCancelResult.receiptId,
          receiptNumber: receiptCancelResult.receiptNumber,
          paymentId: existing.id,
          paymentNumber: existing.paymentNumber,
          cancelledBy: this.context.userId,
          cancelledAt: receiptCancelResult.cancelledAt.toISOString(),
          reason: this.input.reason ?? undefined,
        },
      });
    }

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.PAYMENT_CANCELLED,
      aggregateType: DomainAggregateType.PAYMENT,
      aggregateId: updated.id,
      actorId: this.context.userId,
      payload: {
        paymentId: updated.id,
        invoiceId: updated.invoiceId ?? undefined,
        studentId: updated.studentId ?? undefined,
        enrollmentId: updated.enrollmentId ?? undefined,
        reason: this.input.reason ?? undefined,
        previousStatus: existing.status,
      },
    });

    return updated;
  }
}
