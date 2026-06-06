import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { registerPaymentSchema, type RegisterPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { findPaymentById, getLastPaymentNumber } from "@/modules/finance/repositories/payment.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
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
    const lastNum = await getLastPaymentNumber(this.context.organizationId);
    const paymentNumber = `PAG-${String(lastNum + 1).padStart(6, "0")}`;
    const paymentDate = this.input.paymentDate ? new Date(this.input.paymentDate) : new Date();

    const db = await getDb();

    const created = await db.$transaction(async (tx) => {
      const paymentRow = await tx.payment.create({
        data: {
          organizationId: this.context.organizationId,
          invoiceId: invoice.id,
          installmentId: this.input.installmentId ?? null,
          studentId: invoice.studentId,
          enrollmentId: invoice.enrollmentId,
          paymentNumber,
          paymentDate,
          totalAmount: this.totalAmount,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
        select: { id: true },
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
        paymentNumber,
        totalAmount: this.totalAmount,
        invoiceId: invoice.id,
        status: "PENDING",
        splits: this.input.splits.length,
      },
    });

    return payment;
  }
}
