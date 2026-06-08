import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findTaxRuleById, archiveTaxRule } from "@/modules/billing/repositories/tax-rule.repository";

interface Input { taxRuleId: string }

export class ArchiveTaxRuleCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    if (!this.input.taxRuleId) throw new ValidationError("ID da regra é obrigatório");
    const existing = await findTaxRuleById(this.input.taxRuleId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Regra de Imposto", this.input.taxRuleId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("A regra já está arquivada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.TAX_RULES_ARCHIVE)) throw new AuthorizationError();
  }

  async execute(): Promise<void> {
    await archiveTaxRule(this.input.taxRuleId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "TaxRule",
      entityId: this.input.taxRuleId,
      action: "tax_rule.archived",
    });
  }
}
