import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findDiscountRuleById, archiveDiscountRule } from "@/modules/billing/repositories/discount-rule.repository";

interface Input { discountRuleId: string }

export class ArchiveDiscountRuleCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    if (!this.input.discountRuleId) throw new ValidationError("ID da regra é obrigatório");
    const existing = await findDiscountRuleById(this.input.discountRuleId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Regra de Desconto", this.input.discountRuleId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("A regra já está arquivada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.DISCOUNT_RULES_ARCHIVE)) throw new AuthorizationError();
  }

  async execute(): Promise<void> {
    await archiveDiscountRule(this.input.discountRuleId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "DiscountRule",
      entityId: this.input.discountRuleId,
      action: "discount_rule.archived",
    });
  }
}
