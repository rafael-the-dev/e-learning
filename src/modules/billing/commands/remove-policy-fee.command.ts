import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { removePolicyFee } from "@/modules/billing/repositories/billing-policy.repository";

interface Input { policyFeeId: string; policyId: string }

export class RemovePolicyFeeCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    if (!this.input.policyFeeId) throw new ValidationError("ID da taxa da política é obrigatório");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<void> {
    await removePolicyFee(this.input.policyFeeId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "PolicyFee",
      entityId: this.input.policyFeeId,
      action: "policy_fee.removed",
      newValues: { policyId: this.input.policyId },
    });
  }
}
