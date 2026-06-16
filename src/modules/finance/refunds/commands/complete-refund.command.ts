/**
 * CompleteRefundCommand — C-4 Refund Disbursement
 *
 * Completes an APPROVED refund by applying the appropriate financial mutations
 * inside a single atomic transaction:
 *
 *   1. Lock the payment row (UPDLOCK / ROWLOCK) to prevent concurrent refunds
 *      from both passing the refundable-amount check.
 *   2. Re-validate payment status (CONFIRMED | PARTIALLY_REFUNDED).
 *   3. Calculate refundableAmount from COMPLETED refunds inside the tx
 *      (stable under the payment row lock).
 *   4. Apply refundMethod:
 *      - WALLET_CREDIT  → create positive StudentWalletTransaction (type REFUND)
 *      - CASH_RETURN    → no wallet entry; audit trail only
 *   5. Update Payment.status → REFUNDED (full) or PARTIALLY_REFUNDED (partial).
 *   6. Update Receipt.refundedAmount; set status to CANCELLED (full) or
 *      PARTIALLY_REFUNDED (partial) if a receipt exists.
 *   7. Mark Refund.status = COMPLETED.
 *   8. Commit.
 *
 * IMPORTANT — refund ≠ cancellation:
 *   Payment allocations are NOT reversed. The invoice paid amount does NOT
 *   change. Refund records money returned to the student, not a debt reversal.
 */
import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import {
  completeRefundSchema,
  type CompleteRefundInput,
} from "@/modules/finance/refunds/schemas/refund.schema";
import {
  findRefundById,
  calculateRefundableAmountInTx,
} from "@/modules/finance/refunds/repositories/refund.repository";
import { recordRefundDisbursed } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { Refund } from "@/modules/finance/refunds/types";
import { getDb } from "@/server/db";

type DecimalLike = { toNumber: () => number };

function toNum(v: DecimalLike | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" ? v.toNumber() : v;
}

const REFUNDABLE_PAYMENT_STATUSES = ["CONFIRMED", "PARTIALLY_REFUNDED"];

export class CompleteRefundCommand extends BaseCommand<CompleteRefundInput, Refund> {
  async validate(): Promise<void> {
    const result = completeRefundSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.REFUNDS_COMPLETE)) throw new AuthorizationError();
  }

  async execute(): Promise<Refund> {
    const db = await getDb();

    // Pre-flight — avoids entering a transaction only to find an obvious violation.
    const existing = await findRefundById(this.input.refundId, this.context.organizationId);
    if (!existing) throw new BusinessRuleError("Reembolso não encontrado nesta organização");
    if (existing.status !== "APPROVED") {
      throw new BusinessRuleError("Apenas reembolsos com estado APPROVED podem ser concluídos");
    }

    // Snapshot values needed for audit/events (set inside transaction).
    let prevPaymentStatus: string | null = null;
    let newPaymentStatus: string | null = null;
    let receiptId: string | null = null;
    let prevReceiptStatus: string | null = null;
    let newReceiptStatus: string | null = null;
    let walletTransactionId: string | null = null;

    await db.$transaction(async (tx) => {
      // ─── 1. Lock payment row ────────────────────────────────────────────────
      // SQL Server UPDLOCK + ROWLOCK: blocks any other CompleteRefundCommand for
      // the same payment until this transaction commits or rolls back.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM payments WITH (UPDLOCK, ROWLOCK)
        WHERE id = ${existing.paymentId}
          AND organizationId = ${this.context.organizationId}
      `;
      if (locked.length === 0) {
        throw new BusinessRuleError("Pagamento não encontrado nesta organização");
      }

      // ─── 2. Read & validate payment (row is now locked) ────────────────────
      const payment = await tx.payment.findFirst({
        where: { id: existing.paymentId, organizationId: this.context.organizationId },
        select: { id: true, status: true, totalAmount: true },
      });
      // Guaranteed non-null: the lock query confirmed the row exists.
      const paymentStatus = payment!.status;
      const paymentTotal = toNum(payment!.totalAmount as DecimalLike);

      prevPaymentStatus = paymentStatus;

      if (!REFUNDABLE_PAYMENT_STATUSES.includes(paymentStatus)) {
        throw new BusinessRuleError(
          `Pagamento com estado "${paymentStatus}" não pode ser reembolsado. ` +
          `São aceites: ${REFUNDABLE_PAYMENT_STATUSES.join(", ")}.`
        );
      }

      // ─── 3. Guard against double-completion (TOCTOU inside tx) ─────────────
      const refundCheck = await tx.refund.findFirst({
        where: {
          id: this.input.refundId,
          organizationId: this.context.organizationId,
          status: "APPROVED",
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!refundCheck) {
        throw new BusinessRuleError("O reembolso não está mais disponível para conclusão");
      }

      // ─── 4. Calculate refundable amount inside the locked transaction ───────
      const refundableAmount = await calculateRefundableAmountInTx(
        tx,
        existing.paymentId,
        paymentTotal,
        this.context.organizationId
      );
      if (existing.amount > refundableAmount + 0.001) {
        throw new BusinessRuleError(
          `O valor do reembolso (${existing.amount}) excede o valor reembolsável (${refundableAmount.toFixed(2)})`
        );
      }

      // ─── 5. Apply refundMethod ──────────────────────────────────────────────
      if (existing.refundMethod === "WALLET_CREDIT" && existing.studentId) {
        // Find or create the student wallet.
        let wallet = await tx.studentWallet.findFirst({
          where: { studentId: existing.studentId, organizationId: this.context.organizationId },
          select: { id: true },
        });
        if (!wallet) {
          wallet = await tx.studentWallet.create({
            data: {
              organizationId: this.context.organizationId,
              studentId: existing.studentId,
              status: "ACTIVE",
              createdBy: this.context.userId,
            },
            select: { id: true },
          });
        }
        // Credit the wallet: positive amount = student receives funds.
        // DEPOSIT-like operations do not need lockAndGetWalletBalance.
        const walletTx = await tx.studentWalletTransaction.create({
          data: {
            organizationId: this.context.organizationId,
            studentWalletId: wallet.id,
            type: "REFUND",
            amount: existing.amount,
            referenceType: "Refund",
            referenceId: existing.id,
            description: `Reembolso ${existing.refundNumber}`,
            createdBy: this.context.userId,
          },
          select: { id: true },
        });
        walletTransactionId = walletTx.id;
      }
      // CASH_RETURN: no wallet entry; the refund audit trail is the record.

      // ─── 6. Determine new payment status ───────────────────────────────────
      // completedRefunds (from calculateRefundableAmountInTx) excluded this
      // refund (still APPROVED). Add it now.
      const previouslyCompleted = paymentTotal - refundableAmount;
      const newTotalRefunded = previouslyCompleted + existing.amount;
      newPaymentStatus = newTotalRefunded >= paymentTotal ? "REFUNDED" : "PARTIALLY_REFUNDED";

      await tx.payment.update({
        where: { id: existing.paymentId },
        data: { status: newPaymentStatus, updatedAt: new Date() },
      });

      // ─── 7. Handle receipt ──────────────────────────────────────────────────
      const receipt = await tx.receipt.findFirst({
        where: { paymentId: existing.paymentId, organizationId: this.context.organizationId },
        select: { id: true, amount: true, refundedAmount: true, status: true },
      });

      if (receipt) {
        receiptId = receipt.id;
        prevReceiptStatus = receipt.status;
        const newRefundedAmount = toNum(receipt.refundedAmount as DecimalLike) + existing.amount;
        const receiptTotal = toNum(receipt.amount as DecimalLike);
        const isFull = newRefundedAmount >= receiptTotal;
        newReceiptStatus = isFull ? "CANCELLED" : "PARTIALLY_REFUNDED";

        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            refundedAmount: newRefundedAmount,
            status: newReceiptStatus,
            ...(isFull
              ? {
                  cancelledAt: new Date(),
                  cancelledBy: this.context.userId,
                  cancellationReason: `Reembolso ${existing.refundNumber}`,
                }
              : {}),
          },
        });
      }

      // ─── 8. Complete the refund ─────────────────────────────────────────────
      await tx.refund.update({
        where: { id: this.input.refundId },
        data: {
          status: "COMPLETED",
          completedBy: this.context.userId,
          completedAt: new Date(),
          ...(this.input.notes !== undefined ? { notes: this.input.notes } : {}),
          updatedAt: new Date(),
        },
      });

      // ─── 9. Ledger entry — records the outbound cash/wallet disbursement ───
      await recordRefundDisbursed(tx, this.context.organizationId, {
        refundId: this.input.refundId,
        refundNumber: existing.refundNumber,
        amount: existing.amount,
        refundMethod: existing.refundMethod,
        paymentId: existing.paymentId,
        studentId: existing.studentId,
        actorId: this.context.userId,
      });
    });

    const refund = await findRefundById(this.input.refundId, this.context.organizationId);
    if (!refund) throw new BusinessRuleError("Erro ao recuperar reembolso após conclusão");

    // ─── Audit trail ─────────────────────────────────────────────────────────
    await auditService.log(this.context, {
      entity: "Refund",
      entityId: refund.id,
      action: "refund.completed",
      oldValues: { status: "APPROVED" },
      newValues: {
        status: "COMPLETED",
        refundNumber: refund.refundNumber,
        refundMethod: existing.refundMethod,
        amount: refund.amount,
        paymentId: refund.paymentId,
        receiptId,
        prevPaymentStatus,
        newPaymentStatus,
        prevReceiptStatus,
        newReceiptStatus,
        walletTransactionId,
        actorUserId: this.context.userId,
      },
    });

    if (newPaymentStatus) {
      const paymentAction =
        newPaymentStatus === "REFUNDED" ? "payment.refunded" : "payment.partially_refunded";
      await auditService.log(this.context, {
        entity: "Payment",
        entityId: refund.paymentId,
        action: paymentAction,
        oldValues: { status: prevPaymentStatus },
        newValues: { status: newPaymentStatus, refundNumber: refund.refundNumber },
      });
      await financialAuditService.log(this.context, {
        eventType:
          newPaymentStatus === "REFUNDED"
            ? FinancialAuditEventType.PAYMENT_REFUNDED
            : FinancialAuditEventType.PAYMENT_PARTIALLY_REFUNDED,
        entityType: "Payment",
        entityId: refund.paymentId,
        amount: refund.amount,
        beforeData: { status: prevPaymentStatus },
        afterData: { status: newPaymentStatus },
        metadata: { refundId: refund.id, refundNumber: refund.refundNumber },
      });
    }

    if (receiptId && newReceiptStatus) {
      const receiptAction =
        newReceiptStatus === "CANCELLED" ? "receipt.cancelled" : "receipt.partially_refunded";
      await auditService.log(this.context, {
        entity: "Receipt",
        entityId: receiptId,
        action: receiptAction,
        oldValues: { status: prevReceiptStatus },
        newValues: { status: newReceiptStatus, refundNumber: refund.refundNumber },
      });
      await financialAuditService.log(this.context, {
        eventType:
          newReceiptStatus === "CANCELLED"
            ? FinancialAuditEventType.RECEIPT_CANCELLED
            : FinancialAuditEventType.RECEIPT_PARTIALLY_REFUNDED,
        entityType: "Receipt",
        entityId: receiptId,
        amount: refund.amount,
        beforeData: { status: prevReceiptStatus },
        afterData: { status: newReceiptStatus },
        metadata: { refundId: refund.id, refundNumber: refund.refundNumber, paymentId: refund.paymentId },
      });
    }

    if (walletTransactionId) {
      await auditService.log(this.context, {
        entity: "StudentWalletTransaction",
        entityId: walletTransactionId,
        action: "wallet_transaction.created",
        newValues: {
          type: "REFUND",
          amount: refund.amount,
          refundId: refund.id,
          refundNumber: refund.refundNumber,
        },
      });
    }

    // Financial audit for the refund itself
    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.REFUND_COMPLETED,
      entityType: "Refund",
      entityId: refund.id,
      amount: refund.amount,
      beforeData: { status: "APPROVED" },
      afterData: { status: "COMPLETED", refundMethod: existing.refundMethod },
      metadata: {
        refundNumber: refund.refundNumber,
        paymentId: refund.paymentId,
        receiptId,
        walletTransactionId,
        studentId: refund.studentId ?? null,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.REFUND_COMPLETED,
      aggregateType: DomainAggregateType.REFUND,
      aggregateId: refund.id,
      actorId: this.context.userId,
      payload: {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        paymentId: refund.paymentId,
        amount: refund.amount,
        refundMethod: existing.refundMethod,
        paymentStatus: newPaymentStatus,
        receiptId,
      },
    });

    return refund;
  }
}
