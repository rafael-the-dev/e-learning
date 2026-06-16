import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { issueReceiptSchema, type IssueReceiptInput } from "@/modules/finance/schemas/receipt.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { hasIssuedReceiptForPayment, findReceiptById } from "@/modules/finance/repositories/receipt.repository";
import { sumAllocationsByPayment } from "@/modules/finance/repositories/payment-allocation.repository";
import { getNextReceiptNumber } from "@/modules/finance/services/financial-sequence.service";
import { recordReceiptIssued } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Receipt, Payment } from "@/modules/finance/types";

export class IssueReceiptCommand extends BaseCommand<IssueReceiptInput, Receipt> {
  private payment: Payment | null = null;

  async validate(): Promise<void> {
    const result = issueReceiptSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.payment = await findPaymentById(this.input.paymentId, this.context.organizationId);
    if (!this.payment) throw new NotFoundError("Pagamento", this.input.paymentId);
    if (this.payment.status !== "CONFIRMED") {
      throw new BusinessRuleError("O recibo só pode ser emitido após a confirmação do pagamento");
    }

    const alreadyIssued = await hasIssuedReceiptForPayment(this.input.paymentId, this.context.organizationId);
    if (alreadyIssued) {
      throw new BusinessRuleError("Já existe um recibo emitido para este pagamento");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.RECEIPTS_ISSUE)) throw new AuthorizationError();
  }

  async execute(): Promise<Receipt> {
    const payment = this.payment!;

    // Receipt amount = total applied to invoice (falls back to payment.totalAmount for legacy payments)
    const allocationSum = await sumAllocationsByPayment(payment.id, this.context.organizationId);
    const totalSettled = allocationSum > 0 ? allocationSum : payment.totalAmount;

    const db = await getDb();

    // Sequence number generation and receipt creation are a single atomic operation.
    const { receiptId, receiptNumber } = await db.$transaction(async (tx) => {
      const nextNumber = await getNextReceiptNumber(tx);

      const row = await tx.receipt.create({
        data: {
          organizationId: this.context.organizationId,
          branchId: payment.branchId ?? null,
          paymentId: payment.id,
          invoiceId: payment.invoiceId!,
          studentId: payment.studentId ?? null,
          receiptNumber: nextNumber,
          amount: totalSettled,
          issuedBy: this.context.userId ?? null,
        },
        select: { id: true },
      });

      await recordReceiptIssued(tx, this.context.organizationId, {
        receiptId: row.id,
        receiptNumber: nextNumber,
        amount: totalSettled,
        paymentId: payment.id,
        invoiceId: payment.invoiceId ?? null,
        studentId: payment.studentId ?? null,
        actorId: this.context.userId,
      });

      return { receiptId: row.id, receiptNumber: nextNumber };
    });

    const receipt = await findReceiptById(receiptId, this.context.organizationId);
    if (!receipt) throw new BusinessRuleError("Erro ao recuperar recibo após emissão");

    await auditService.log(this.context, {
      entity: "Receipt",
      entityId: receipt.id,
      action: "receipt.issued",
      newValues: {
        receiptNumber,
        paymentId: payment.id,
        amount: totalSettled,
      },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.RECEIPT_ISSUED,
      entityType: "Receipt",
      entityId: receipt.id,
      amount: totalSettled,
      afterData: { receiptNumber, status: "ISSUED" },
      metadata: {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        invoiceId: payment.invoiceId ?? null,
        studentId: payment.studentId ?? null,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.RECEIPT_ISSUED,
      aggregateType: DomainAggregateType.RECEIPT,
      aggregateId: receipt.id,
      actorId: this.context.userId,
      payload: {
        receiptId: receipt.id,
        receiptNumber,
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        studentId: payment.studentId,
        amount: totalSettled,
      },
    });

    return receipt;
  }
}
