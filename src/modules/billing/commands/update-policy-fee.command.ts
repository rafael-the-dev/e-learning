import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { updatePolicyFeeSchema, type UpdatePolicyFeeSchema } from "@/modules/billing/schemas/policy-fee.schema";
import { findBillingPolicyById, updatePolicyFee } from "@/modules/billing/repositories/billing-policy.repository";
import type { PolicyFee } from "@/modules/billing/types";

export class UpdatePolicyFeeCommand extends BaseCommand<UpdatePolicyFeeSchema, PolicyFee> {
  async validate(): Promise<void> {
    const result = updatePolicyFeeSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const policy = await findBillingPolicyById(this.input.policyId, this.context.organizationId);
    if (!policy) throw new BusinessRuleError("Política de Faturação não encontrada.");
    if (policy.status === "ARCHIVED") throw new BusinessRuleError("Não é possível editar taxas de uma política arquivada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<PolicyFee> {
    const { policyFeeId, policyId: _policyId, ...rest } = this.input;
    const fee = await updatePolicyFee(policyFeeId, this.context.organizationId, rest);

    await auditService.log(this.context, {
      entity: "PolicyFee",
      entityId: policyFeeId,
      action: "policy_fee.updated",
      newValues: { amountType: fee.amountType, fixedAmount: fee.fixedAmount, percentage: fee.percentage },
    });

    return fee;
  }
}
