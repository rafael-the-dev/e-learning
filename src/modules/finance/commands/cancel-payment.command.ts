import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelPaymentSchema, type CancelPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
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
    } else {
      // CONFIRMED — reverse all financial effects atomically
      await db.$transaction(async (tx) => {
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

        // 2. Reverse overpayment credit if present (block if wallet has been spent)
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

        // 4. Reverse invoice balance
        if (existing.invoiceId && totalApplied > 0) {
          const inv = await tx.invoice.findUniqueOrThrow({
            where: { id: existing.invoiceId, organizationId: this.context.organizationId },
            select: { paidAmount: true, totalAmount: true },
          });
          const newPaid = Math.max(0, (inv.paidAmount as DecimalLike).toNumber() - totalApplied);
          const newBalance = (inv.totalAmount as DecimalLike).toNumber() - newPaid;
          await tx.invoice.update({
            where: { id: existing.invoiceId, organizationId: this.context.organizationId },
            data: {
              paidAmount: newPaid,
              balanceAmount: newBalance,
              status: newPaid <= 0 ? "PENDING" : "PARTIALLY_PAID",
            },
          });
        }

        // 5. Mark payment cancelled
        await tx.payment.update({
          where: { id: existing.id, organizationId: this.context.organizationId },
          data: { status: "CANCELLED" },
        });
      });
    }

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
