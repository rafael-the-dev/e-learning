import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createBillingPolicySchema, type CreateBillingPolicySchema } from "@/modules/billing/schemas/billing-policy.schema";
import {
  createBillingPolicy,
  policyNameExistsInOrg,
} from "@/modules/billing/repositories/billing-policy.repository";
import type { EnrollmentBillingPolicy } from "@/modules/billing/types";

export class CreateBillingPolicyCommand extends BaseCommand<CreateBillingPolicySchema, EnrollmentBillingPolicy> {
  async validate(): Promise<void> {
    const result = createBillingPolicySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const nameExists = await policyNameExistsInOrg(this.input.name, this.context.organizationId);
    if (nameExists) throw new BusinessRuleError(`Já existe uma política com o nome '${this.input.name}' nesta organização.`);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.BILLING_POLICIES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<EnrollmentBillingPolicy> {
    const policy = await createBillingPolicy({
      organizationId: this.context.organizationId,
      name: this.input.name,
      description: this.input.description ?? null,
      autoGenerateInvoiceOnEnrollment: this.input.autoGenerateInvoiceOnEnrollment ?? true,
      invoiceMode: this.input.invoiceMode ?? "SINGLE_INVOICE",
      activationRule: this.input.activationRule ?? "MANUAL",
      installmentsRequired: this.input.installmentsRequired ?? false,
      defaultNumberOfInstallments: this.input.defaultNumberOfInstallments ?? null,
      minimumFirstPaymentAmount: this.input.minimumFirstPaymentAmount ?? null,
      allowWalletCreditOnEnrollment: this.input.allowWalletCreditOnEnrollment ?? true,
      isDefault: this.input.isDefault ?? false,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "EnrollmentBillingPolicy",
      entityId: policy.id,
      action: "billing_policy.created",
      newValues: { name: policy.name, invoiceMode: policy.invoiceMode, activationRule: policy.activationRule, isDefault: policy.isDefault },
    });

    return policy;
  }
}
