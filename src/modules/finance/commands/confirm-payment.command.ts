import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { confirmPaymentSchema, type ConfirmPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findPaymentById, updatePaymentStatus } from "@/modules/finance/repositories/payment.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { Payment } from "@/modules/finance/types";

export class ConfirmPaymentCommand extends BaseCommand<ConfirmPaymentInput, Payment> {
  private existing: Payment | null = null;

  async validate(): Promise<void> {
    const result = confirmPaymentSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    this.existing = await findPaymentById(this.input.paymentId, this.context.organizationId);
    if (!this.existing) throw new NotFoundError("Pagamento", this.input.paymentId);
    if (this.existing.status !== "PENDING") throw new BusinessRuleError("Apenas pagamentos pendentes podem ser confirmados");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CONFIRM)) throw new AuthorizationError();
  }

  async execute(): Promise<Payment> {
    const updated = await updatePaymentStatus(this.input.paymentId, this.context.organizationId, "CONFIRMED");

    await auditService.log(this.context, {
      entity: "Payment",
      entityId: updated.id,
      action: "payment.confirmed",
      oldValues: { status: "PENDING" },
      newValues: { status: "CONFIRMED" },
    });

    return updated;
  }
}
