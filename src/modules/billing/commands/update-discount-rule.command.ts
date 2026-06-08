import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { updateDiscountRuleSchema, type UpdateDiscountRuleSchema } from "@/modules/billing/schemas/discount-rule.schema";
import { findDiscountRuleById, updateDiscountRule, discountCodeExistsInOrg } from "@/modules/billing/repositories/discount-rule.repository";
import type { DiscountRule } from "@/modules/billing/types";

export class UpdateDiscountRuleCommand extends BaseCommand<UpdateDiscountRuleSchema, DiscountRule> {
  async validate(): Promise<void> {
    const result = updateDiscountRuleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findDiscountRuleById(this.input.discountRuleId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Regra de Desconto", this.input.discountRuleId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("Não é possível editar uma regra arquivada.");

    if (this.input.code && this.input.code !== existing.code) {
      const codeExists = await discountCodeExistsInOrg(this.input.code, this.context.organizationId, this.input.discountRuleId);
      if (codeExists) throw new BusinessRuleError(`Já existe um desconto com o código '${this.input.code}'.`);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.DISCOUNT_RULES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<DiscountRule> {
    const { discountRuleId, startDate, endDate, ...rest } = this.input;
    const discount = await updateDiscountRule(discountRuleId, this.context.organizationId, {
      ...rest,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "DiscountRule",
      entityId: discount.id,
      action: "discount_rule.updated",
      newValues: { code: discount.code, name: discount.name, value: discount.value },
    });

    return discount;
  }
}
