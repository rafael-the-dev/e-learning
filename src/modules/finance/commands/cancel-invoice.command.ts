import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelInvoiceSchema, type CancelInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { recordInvoiceCancelled } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { Invoice } from "@/modules/finance/types";

export class CancelInvoiceCommand extends BaseCommand<CancelInvoiceInput, Invoice> {
  private existing: Invoice | null = null;

  async validate(): Promise<void> {
    const result = cancelInvoiceSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (this.existing.status === "CANCELLED") throw new BusinessRuleError("Fatura já está cancelada");
    if (this.existing.paidAmount > 0) throw new BusinessRuleError("Não é possível cancelar uma fatura com pagamentos registados");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INVOICES_CANCEL)) throw new AuthorizationError();
  }

  async execute(): Promise<Invoice> {
    const existing = this.existing!;
    const db = await getDb();

    // Wrap status update + ledger entry in a single atomic transaction so that
    // a ledger entry is never written without the invoice actually being cancelled.
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: existing.id, organizationId: this.context.organizationId },
        data: { status: "CANCELLED", updatedBy: this.context.userId },
      });

      await recordInvoiceCancelled(tx, this.context.organizationId, {
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        amount: existing.totalAmount,
        studentId: existing.studentId,
        enrollmentId: existing.enrollmentId,
        actorId: this.context.userId,
      });
    });

    const updated = await findInvoiceById(existing.id, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar fatura após cancelamento");

    await auditService.log(this.context, {
      entity: "Invoice",
      entityId: updated.id,
      action: "CANCELLED",
      oldValues: { status: existing.status },
      newValues: { status: "CANCELLED", reason: this.input.reason },
    });

    return updated;
  }
}
