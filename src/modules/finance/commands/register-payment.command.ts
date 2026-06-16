import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { registerPaymentSchema, type RegisterPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { findPaymentById } from "@/modules/finance/repositories/payment.repository";
import { getNextPaymentNumber } from "@/modules/finance/services/financial-sequence.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { Payment, Invoice } from "@/modules/finance/types";
import { getDb } from "@/server/db";

export class RegisterPaymentCommand extends BaseCommand<RegisterPaymentInput, Payment> {
  private invoice: Invoice | null = null;
  private totalAmount = 0;

  async validate(): Promise<void> {
    const result = registerPaymentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.totalAmount = this.input.splits.reduce((sum, s) => sum + s.amount, 0);
    if (this.totalAmount <= 0) {
      throw new BusinessRuleError("O valor total do pagamento deve ser maior que zero");
    }

    this.invoice = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!this.invoice) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (this.invoice.status === "CANCELLED") throw new BusinessRuleError("Não é possível pagar uma fatura cancelada");
    if (this.invoice.status === "PAID") throw new BusinessRuleError("Fatura já está totalmente paga");

    if (this.input.installmentId) {
      const db = await getDb();
      const inst = await db.installment.findFirst({
        where: { id: this.input.installmentId, organizationId: this.context.organizationId },
        select: { id: true, status: true },
      });
      if (!inst) throw new BusinessRuleError("Prestação não encontrada nesta organização");
      if (inst.status === "PAID") throw new BusinessRuleError("Prestação já está paga");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Payment> {
    const invoice = this.invoice!;
    const paymentDate = this.input.paymentDate ? new Date(this.input.paymentDate) : new Date();

    const db = await getDb();

    // Sequence number generation is inside the transaction so the number and
    // the payment row are created atomically — no gap or duplicate is possible.
    const created = await db.$transaction(async (tx) => {
      const paymentNumber = await getNextPaymentNumber(tx);

      const paymentRow = await tx.payment.create({
        data: {
          organizationId: this.context.organizationId,
          invoiceId: invoice.id,
          installmentId: this.input.installmentId ?? null,
          studentId: invoice.studentId,
          enrollmentId: invoice.enrollmentId,
          branchId: invoice.branchId ?? null,
          paymentNumber,
          paymentDate,
          totalAmount: this.totalAmount,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
        select: { id: true, paymentNumber: true },
      });

      await tx.paymentSplit.createMany({
        data: this.input.splits.map((s) => ({
          organizationId: this.context.organizationId,
          paymentId: paymentRow.id,
          method: s.method,
          amount: s.amount,
          reference: s.reference ?? null,
          notes: s.notes ?? null,
        })),
      });

      return paymentRow;
    });

    const payment = await findPaymentById(created.id, this.context.organizationId);
    if (!payment) throw new BusinessRuleError("Erro ao recuperar pagamento após criação");

    await auditService.log(this.context, {
      entity: "Payment",
      entityId: payment.id,
      action: "payment.registered",
      newValues: {
        paymentNumber: created.paymentNumber,
        totalAmount: this.totalAmount,
        invoiceId: invoice.id,
        status: "PENDING",
        splits: this.input.splits.length,
      },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.PAYMENT_REGISTERED,
      entityType: "Payment",
      entityId: payment.id,
      amount: this.totalAmount,
      afterData: { paymentNumber: created.paymentNumber, status: "PENDING", splitCount: this.input.splits.length },
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.studentId ?? null,
        enrollmentId: invoice.enrollmentId ?? null,
        installmentId: this.input.installmentId ?? null,
      },
    });

    return payment;
  }
}
