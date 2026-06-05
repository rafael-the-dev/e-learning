import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { updateInvoiceSchema, type UpdateInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import { findInvoiceById, updateInvoice } from "@/modules/finance/repositories/invoice.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { Invoice } from "@/modules/finance/types";

export class UpdateInvoiceCommand extends BaseCommand<UpdateInvoiceInput, Invoice> {
  private existing: Invoice | null = null;

  async validate(): Promise<void> {
    const result = updateInvoiceSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.existing = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (this.existing.status === "CANCELLED") throw new BusinessRuleError("Não é possível atualizar uma fatura cancelada");
    if (this.existing.status === "PAID") throw new BusinessRuleError("Não é possível atualizar uma fatura já paga");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INVOICES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Invoice> {
    const existing = this.existing!;
    const discountAmount = this.input.discountAmount ?? existing.discountAmount;
    const taxAmount = this.input.taxAmount ?? existing.taxAmount;
    const totalAmount = existing.subtotal - discountAmount + taxAmount;
    const balanceAmount = totalAmount - existing.paidAmount;

    const updated = await updateInvoice(this.input.invoiceId, this.context.organizationId, {
      dueDate: this.input.dueDate ? new Date(this.input.dueDate) : undefined,
      discountAmount,
      taxAmount,
      totalAmount,
      balanceAmount,
      notes: this.input.notes,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Invoice",
      entityId: updated.id,
      action: "UPDATED",
      oldValues: { discountAmount: existing.discountAmount, taxAmount: existing.taxAmount },
      newValues: { discountAmount, taxAmount, totalAmount },
    });

    return updated;
  }
}
