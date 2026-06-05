import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { createPaymentPlanSchema, type CreatePaymentPlanInput } from "@/modules/finance/schemas/payment-plan.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { createPaymentPlan, findPaymentPlanByInvoice } from "@/modules/finance/repositories/payment-plan.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { PaymentPlan, Invoice } from "@/modules/finance/types";

export class CreatePaymentPlanCommand extends BaseCommand<CreatePaymentPlanInput, PaymentPlan> {
  private invoice: Invoice | null = null;

  async validate(): Promise<void> {
    const result = createPaymentPlanSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.invoice = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!this.invoice) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (this.invoice.status === "CANCELLED") throw new BusinessRuleError("Não é possível criar plano para fatura cancelada");
    if (this.invoice.status === "PAID") throw new BusinessRuleError("Fatura já está paga");

    const existing = await findPaymentPlanByInvoice(this.input.invoiceId, this.context.organizationId);
    if (existing) throw new BusinessRuleError("Esta fatura já tem um plano de pagamento");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENT_PLANS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<PaymentPlan> {
    const invoice = this.invoice!;
    const totalAmount = invoice.balanceAmount;
    const n = this.input.numberOfInstallments;
    const baseAmount = Math.floor((totalAmount / n) * 100) / 100;
    const lastAmount = Math.round((totalAmount - baseAmount * (n - 1)) * 100) / 100;

    const firstDue = new Date(this.input.firstDueDate);
    const installments = Array.from({ length: n }, (_, i) => {
      const dueDate = new Date(firstDue);
      dueDate.setMonth(dueDate.getMonth() + i);
      return {
        invoiceId: invoice.id,
        installmentNumber: i + 1,
        dueDate,
        amount: i === n - 1 ? lastAmount : baseAmount,
      };
    });

    const plan = await createPaymentPlan({
      organizationId: this.context.organizationId,
      invoiceId: invoice.id,
      name: this.input.name,
      numberOfInstallments: n,
      totalAmount,
      installments,
    });

    await auditService.log(this.context, {
      entity: "PaymentPlan",
      entityId: plan.id,
      action: "CREATED",
      newValues: { invoiceId: invoice.id, numberOfInstallments: n, totalAmount },
    });

    return plan;
  }
}
