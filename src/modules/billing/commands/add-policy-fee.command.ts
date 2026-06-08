import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { addPolicyFeeSchema, type AddPolicyFeeSchema } from "@/modules/billing/schemas/policy-fee.schema";
import { findBillingPolicyById, addPolicyFee, policyFeeExists } from "@/modules/billing/repositories/billing-policy.repository";
import { findFeeDefinitionById } from "@/modules/billing/repositories/fee-definition.repository";
import type { PolicyFee } from "@/modules/billing/types";

export class AddPolicyFeeCommand extends BaseCommand<AddPolicyFeeSchema, PolicyFee> {
  async validate(): Promise<void> {
    const result = addPolicyFeeSchema.safeParse(this.input);
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
    if (!policy) throw new NotFoundError("Política de Faturação", this.input.policyId);
    if (policy.status === "ARCHIVED") throw new BusinessRuleError("Não é possível adicionar taxas a uma política arquivada.");

    const feeDef = await findFeeDefinitionById(this.input.feeDefinitionId, this.context.organizationId);
    if (!feeDef) throw new NotFoundError("Taxa", this.input.feeDefinitionId);

    const alreadyExists = await policyFeeExists(this.input.policyId, this.input.feeDefinitionId, this.context.organizationId);
    if (alreadyExists) throw new BusinessRuleError("Esta taxa já foi adicionada a esta política.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<PolicyFee> {
    const fee = await addPolicyFee({
      organizationId: this.context.organizationId,
      policyId: this.input.policyId,
      feeDefinitionId: this.input.feeDefinitionId,
      amountType: this.input.amountType ?? "FIXED",
      fixedAmount: this.input.fixedAmount ?? null,
      percentage: this.input.percentage ?? null,
      isRequired: this.input.isRequired ?? true,
      priority: this.input.priority ?? 7,
    });

    await auditService.log(this.context, {
      entity: "PolicyFee",
      entityId: fee.id,
      action: "policy_fee.added",
      newValues: { policyId: this.input.policyId, feeDefinitionId: this.input.feeDefinitionId, amountType: fee.amountType },
    });

    return fee;
  }
}
