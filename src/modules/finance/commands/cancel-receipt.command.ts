import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelReceiptSchema, type CancelReceiptInput } from "@/modules/finance/schemas/receipt.schema";
import { findReceiptById, updateReceiptStatus } from "@/modules/finance/repositories/receipt.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { Receipt } from "@/modules/finance/types";

export class CancelReceiptCommand extends BaseCommand<CancelReceiptInput, Receipt> {
  private existing: Receipt | null = null;

  async validate(): Promise<void> {
    const result = cancelReceiptSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findReceiptById(this.input.receiptId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Recibo", this.input.receiptId);
    if (this.existing.status === "CANCELLED") throw new BusinessRuleError("Recibo já está cancelado");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.RECEIPTS_CANCEL)) throw new AuthorizationError();
  }

  async execute(): Promise<Receipt> {
    const updated = await updateReceiptStatus(this.input.receiptId, this.context.organizationId, "CANCELLED");

    await auditService.log(this.context, {
      entity: "Receipt",
      entityId: updated.id,
      action: "CANCELLED",
      oldValues: { status: "ISSUED" },
      newValues: { status: "CANCELLED", reason: this.input.reason },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.RECEIPT_CANCELLED,
      entityType: "Receipt",
      entityId: updated.id,
      amount: updated.amount,
      beforeData: { status: this.existing!.status },
      afterData: { status: "CANCELLED", reason: this.input.reason ?? null },
      metadata: { paymentId: updated.paymentId, invoiceId: updated.invoiceId },
    });

    return updated;
  }
}
