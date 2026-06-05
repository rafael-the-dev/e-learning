import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { cancelPaymentPlanSchema, type CancelPaymentPlanInput } from "@/modules/finance/schemas/payment-plan.schema";
import { findPaymentPlanById, updatePaymentPlan } from "@/modules/finance/repositories/payment-plan.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { PaymentPlan } from "@/modules/finance/types";

export class CancelPaymentPlanCommand extends BaseCommand<CancelPaymentPlanInput, PaymentPlan> {
  private existing: PaymentPlan | null = null;

  async validate(): Promise<void> {
    const result = cancelPaymentPlanSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findPaymentPlanById(this.input.paymentPlanId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Plano de pagamento", this.input.paymentPlanId);
    if (this.existing.status === "CANCELLED") throw new BusinessRuleError("Plano de pagamento já está cancelado");
    if (this.existing.status === "COMPLETED") throw new BusinessRuleError("Não é possível cancelar um plano concluído");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENT_PLANS_CANCEL)) throw new AuthorizationError();
  }

  async execute(): Promise<PaymentPlan> {
    const updated = await updatePaymentPlan(this.input.paymentPlanId, this.context.organizationId, {
      status: "CANCELLED",
    });

    await auditService.log(this.context, {
      entity: "PaymentPlan",
      entityId: updated.id,
      action: "CANCELLED",
      oldValues: { status: this.existing!.status },
      newValues: { status: "CANCELLED", reason: this.input.reason },
    });

    return updated;
  }
}
