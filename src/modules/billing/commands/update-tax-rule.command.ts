import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { updateTaxRuleSchema, type UpdateTaxRuleSchema } from "@/modules/billing/schemas/tax-rule.schema";
import { findTaxRuleById, updateTaxRule, taxCodeExistsInOrg } from "@/modules/billing/repositories/tax-rule.repository";
import type { TaxRule } from "@/modules/billing/types";

export class UpdateTaxRuleCommand extends BaseCommand<UpdateTaxRuleSchema, TaxRule> {
  async validate(): Promise<void> {
    const result = updateTaxRuleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findTaxRuleById(this.input.taxRuleId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Regra de Imposto", this.input.taxRuleId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("Não é possível editar uma regra arquivada.");

    if (this.input.code && this.input.code !== existing.code) {
      const codeExists = await taxCodeExistsInOrg(this.input.code, this.context.organizationId, this.input.taxRuleId);
      if (codeExists) throw new BusinessRuleError(`Já existe um imposto com o código '${this.input.code}'.`);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TAX_RULES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<TaxRule> {
    const { taxRuleId, ...rest } = this.input;
    const tax = await updateTaxRule(taxRuleId, this.context.organizationId, {
      ...rest,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "TaxRule",
      entityId: tax.id,
      action: "tax_rule.updated",
      newValues: { code: tax.code, name: tax.name, rate: tax.rate },
    });

    return tax;
  }
}
