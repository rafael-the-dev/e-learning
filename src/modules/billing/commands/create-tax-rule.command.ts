import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createTaxRuleSchema, type CreateTaxRuleSchema } from "@/modules/billing/schemas/tax-rule.schema";
import { createTaxRule, taxCodeExistsInOrg } from "@/modules/billing/repositories/tax-rule.repository";
import type { TaxRule } from "@/modules/billing/types";

export class CreateTaxRuleCommand extends BaseCommand<CreateTaxRuleSchema, TaxRule> {
  async validate(): Promise<void> {
    const result = createTaxRuleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const exists = await taxCodeExistsInOrg(this.input.code, this.context.organizationId);
    if (exists) throw new BusinessRuleError(`Já existe um imposto com o código '${this.input.code}' nesta organização.`);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TAX_RULES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<TaxRule> {
    const tax = await createTaxRule({
      organizationId: this.context.organizationId,
      code: this.input.code,
      name: this.input.name,
      description: this.input.description ?? null,
      rate: this.input.rate,
      appliesTo: this.input.appliesTo ?? "ENROLLMENT",
      isIncludedInPrice: this.input.isIncludedInPrice ?? false,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "TaxRule",
      entityId: tax.id,
      action: "tax_rule.created",
      newValues: { code: tax.code, name: tax.name, rate: tax.rate, isIncludedInPrice: tax.isIncludedInPrice },
    });

    return tax;
  }
}
