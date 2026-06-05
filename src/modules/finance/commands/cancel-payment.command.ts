import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelPaymentSchema, type CancelPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
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

    await db.$transaction(async (tx) => {
      // 1. Reverse wallet credit applications linked to this payment
      if (existing.walletCreditAmount > 0) {
        const creditApps = await tx.creditApplication.findMany({
          where: { paymentId: existing.id, organizationId: this.context.organizationId },
          select: { id: true, studentWalletId: true, amount: true },
        });
        for (const ca of creditApps) {
          await tx.studentWalletTransaction.create({
            data: {
              organizationId: this.context.organizationId,
              studentWalletId: ca.studentWalletId,
              type: "ADJUSTMENT",
              amount: (ca.amount as DecimalLike).toNumber(),
              referenceType: "Payment",
              referenceId: existing.id,
              description: `Crédito revertido — cancelamento do pagamento ${existing.paymentNumber}`,
              createdBy: this.context.userId,
            },
          });
        }
      }

      // 2. Reverse overpayment credit if it exists
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
        // Check the wallet still has enough balance to absorb the reversal
        const balanceResult = await tx.studentWalletTransaction.aggregate({
          where: { studentWalletId: overpaymentTx.studentWalletId },
          _sum: { amount: true },
        });
        const currentBalance = (balanceResult._sum.amount as DecimalLike | null)?.toNumber() ?? 0;
        if (currentBalance < overpaymentAmount) {
          throw new BusinessRuleError(
            `Não é possível cancelar este pagamento. O excesso de ${overpaymentAmount.toFixed(2)} foi parcialmente utilizado (saldo atual: ${currentBalance.toFixed(2)})`
          );
        }
        await tx.studentWalletTransaction.create({
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
        });
      }

      // 3. Reverse invoice balance using the exact amount that was applied
      if (existing.invoiceId) {
        // Use invoiceAppliedAmount (walletCredit + cashApplied) when available;
        // fall back to totalAmount for legacy records without the field.
        const reversalAmount = existing.invoiceAppliedAmount ?? (existing.walletCreditAmount + existing.totalAmount);

        const inv = await tx.invoice.findUniqueOrThrow({
          where: { id: existing.invoiceId, organizationId: this.context.organizationId },
          select: { paidAmount: true, totalAmount: true },
        });
        const currentPaid = (inv.paidAmount as DecimalLike).toNumber();
        const invoiceTotal = (inv.totalAmount as DecimalLike).toNumber();
        const newPaid = Math.max(0, currentPaid - reversalAmount);
        const newBalance = invoiceTotal - newPaid;
        await tx.invoice.update({
          where: { id: existing.invoiceId, organizationId: this.context.organizationId },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: newPaid <= 0 ? "PENDING" : "PARTIALLY_PAID",
          },
        });
      }

      // 4. Mark payment as cancelled
      await tx.payment.update({
        where: { id: existing.id, organizationId: this.context.organizationId },
        data: { status: "CANCELLED" },
      });
    });

    const updated = await findPaymentById(existing.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar pagamento após cancelamento");

    await auditService.log(this.context, {
      entity: "Payment",
      entityId: updated.id,
      action: "CANCELLED",
      oldValues: { status: existing.status },
      newValues: {
        status: "CANCELLED",
        reason: this.input.reason,
        walletCreditReversed: existing.walletCreditAmount > 0 ? existing.walletCreditAmount : undefined,
      },
    });

    return updated;
  }
}
