import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { issueReceiptSchema, type IssueReceiptInput } from "@/modules/finance/schemas/receipt.schema";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { createReceipt, hasIssuedReceiptForPayment, getLastReceiptNumber } from "@/modules/finance/repositories/receipt.repository";
import { sumAllocationsByPayment } from "@/modules/finance/repositories/payment-allocation.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
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

    // Receipt amount = total applied to invoice (sum of all allocations for this payment)
    // Falls back to payment.totalAmount for legacy payments without allocation records
    const allocationSum = await sumAllocationsByPayment(payment.id, this.context.organizationId);
    const totalSettled = allocationSum > 0 ? allocationSum : payment.totalAmount;

    const lastNum = await getLastReceiptNumber(this.context.organizationId);
    const receiptNumber = `REC-${String(lastNum + 1).padStart(6, "0")}`;

    const receipt = await createReceipt({
      organizationId: this.context.organizationId,
      branchId: payment.branchId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId!,
      studentId: payment.studentId,
      receiptNumber,
      amount: totalSettled,
      issuedBy: this.context.userId,
    });

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
