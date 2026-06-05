import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import { createInvoice, getLastInvoiceNumber } from "@/modules/finance/repositories/invoice.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { Invoice } from "@/modules/finance/types";
import type { ServiceContext } from "@/shared/types/common";
import { getDb } from "@/server/db";

export class CreateInvoiceCommand extends BaseCommand<CreateInvoiceInput, Invoice> {
  async validate(): Promise<void> {
    const result = createInvoiceSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.enrollmentId) {
      const db = await getDb();
      const enrollment = await db.enrollment.findFirst({
        where: { id: this.input.enrollmentId, organizationId: this.context.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!enrollment) throw new BusinessRuleError("Matrícula não encontrada nesta organização");
    }

    if (this.input.studentId) {
      const db = await getDb();
      const student = await db.student.findFirst({
        where: { id: this.input.studentId, organizationId: this.context.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!student) throw new BusinessRuleError("Aluno não encontrado nesta organização");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INVOICES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Invoice> {
    const lastNum = await getLastInvoiceNumber(this.context.organizationId);
    const invoiceNumber = `FAT-${String(lastNum + 1).padStart(6, "0")}`;

    const subtotal = this.input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = this.input.discountAmount ?? 0;
    const taxAmount = this.input.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;

    if (totalAmount <= 0) {
      throw new BusinessRuleError("O valor total da fatura deve ser maior que zero");
    }

    const items = this.input.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const invoice = await createInvoice({
      organizationId: this.context.organizationId,
      branchId: this.input.branchId ?? null,
      enrollmentId: this.input.enrollmentId ?? null,
      studentId: this.input.studentId ?? null,
      invoiceNumber,
      dueDate: this.input.dueDate ? new Date(this.input.dueDate) : null,
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      notes: this.input.notes ?? null,
      createdBy: this.context.userId,
      items,
    });

    await auditService.log(this.context, {
      entity: "Invoice",
      entityId: invoice.id,
      action: "CREATED",
      newValues: { invoiceNumber, totalAmount, status: "PENDING" },
    });

    return invoice;
  }
}
