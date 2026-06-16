import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import { createInvoiceSchema, type CreateInvoiceInput } from "@/modules/finance/schemas/invoice.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { getNextInvoiceNumber } from "@/modules/finance/services/financial-sequence.service";
import { recordInvoiceCreated } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { ITEM_TYPE_PRIORITY } from "@/modules/finance/types";
import type { Invoice } from "@/modules/finance/types";
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
    const subtotal = this.input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = this.input.discountAmount ?? 0;
    const taxAmount = this.input.taxAmount ?? 0;
    const totalAmount = subtotal - discountAmount + taxAmount;

    if (totalAmount <= 0) {
      throw new BusinessRuleError("O valor total da fatura deve ser maior que zero");
    }

    const db = await getDb();

    // Sequence number generation and record creation are a single atomic operation.
    // No other transaction can observe the same sequence value.
    const { invoiceId, invoiceNumber } = await db.$transaction(async (tx) => {
      const nextNumber = await getNextInvoiceNumber(tx);

      const row = await tx.invoice.create({
        data: {
          organizationId: this.context.organizationId,
          branchId: this.input.branchId ?? null,
          enrollmentId: this.input.enrollmentId ?? null,
          studentId: this.input.studentId ?? null,
          invoiceNumber: nextNumber,
          dueDate: this.input.dueDate ? new Date(this.input.dueDate) : null,
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          balanceAmount: totalAmount,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
          items: {
            create: this.input.items.map((item) => {
              const itemType = item.itemType ?? "OTHER";
              return {
                organizationId: this.context.organizationId,
                feeDefinitionId: null,
                itemType,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: item.quantity * item.unitPrice,
                balanceAmount: item.quantity * item.unitPrice,
                priority: ITEM_TYPE_PRIORITY[itemType] ?? 7,
              };
            }),
          },
        },
        select: { id: true },
      });

      await recordInvoiceCreated(tx, this.context.organizationId, {
        invoiceId: row.id,
        invoiceNumber: nextNumber,
        amount: totalAmount,
        studentId: this.input.studentId,
        enrollmentId: this.input.enrollmentId,
        actorId: this.context.userId,
      });

      return { invoiceId: row.id, invoiceNumber: nextNumber };
    });

    const invoice = await findInvoiceById(invoiceId, this.context.organizationId);
    if (!invoice) throw new BusinessRuleError("Erro ao recuperar fatura após criação");

    await auditService.log(this.context, {
      entity: "Invoice",
      entityId: invoice.id,
      action: "CREATED",
      newValues: { invoiceNumber, totalAmount, status: "PENDING" },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.INVOICE_CREATED,
      entityType: "Invoice",
      entityId: invoice.id,
      amount: totalAmount,
      afterData: { invoiceNumber, totalAmount, status: "PENDING", itemCount: this.input.items.length },
      metadata: {
        studentId: this.input.studentId ?? null,
        enrollmentId: this.input.enrollmentId ?? null,
        branchId: this.input.branchId ?? null,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.INVOICE_CREATED,
      aggregateType: DomainAggregateType.INVOICE,
      aggregateId: invoice.id,
      actorId: this.context.userId,
      payload: {
        invoiceId: invoice.id,
        invoiceNumber,
        enrollmentId: invoice.enrollmentId ?? undefined,
        studentId: invoice.studentId ?? undefined,
        totalAmount,
      },
    });

    return invoice;
  }
}
