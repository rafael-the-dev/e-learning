import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { updateBillingPolicySchema, type UpdateBillingPolicySchema } from "@/modules/billing/schemas/billing-policy.schema";
import {
  findBillingPolicyById,
  updateBillingPolicy,
  policyNameExistsInOrg,
} from "@/modules/billing/repositories/billing-policy.repository";
import type { EnrollmentBillingPolicy } from "@/modules/billing/types";

export class UpdateBillingPolicyCommand extends BaseCommand<UpdateBillingPolicySchema, EnrollmentBillingPolicy> {
  async validate(): Promise<void> {
    const result = updateBillingPolicySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findBillingPolicyById(this.input.policyId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Política de Faturação", this.input.policyId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("Não é possível editar uma política arquivada.");

    if (this.input.name && this.input.name !== existing.name) {
      const nameExists = await policyNameExistsInOrg(this.input.name, this.context.organizationId, this.input.policyId);
      if (nameExists) throw new BusinessRuleError(`Já existe uma política com o nome '${this.input.name}'.`);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<EnrollmentBillingPolicy> {
    const { policyId, ...rest } = this.input;

    const policy = await updateBillingPolicy(policyId, this.context.organizationId, {
      ...rest,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "EnrollmentBillingPolicy",
      entityId: policy.id,
      action: "billing_policy.updated",
      newValues: { name: policy.name, invoiceMode: policy.invoiceMode, activationRule: policy.activationRule },
    });

    return policy;
  }
}
