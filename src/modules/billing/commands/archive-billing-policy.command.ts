import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findBillingPolicyById, archiveBillingPolicy } from "@/modules/billing/repositories/billing-policy.repository";

interface Input { policyId: string }

export class ArchiveBillingPolicyCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    if (!this.input.policyId) throw new ValidationError("ID da política é obrigatório");
    const existing = await findBillingPolicyById(this.input.policyId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Política de Faturação", this.input.policyId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("A política já está arquivada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_ARCHIVE)) throw new AuthorizationError();
  }

  async execute(): Promise<void> {
    await archiveBillingPolicy(this.input.policyId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "EnrollmentBillingPolicy",
      entityId: this.input.policyId,
      action: "billing_policy.archived",
    });
  }
}
