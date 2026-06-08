import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createDiscountRuleSchema, type CreateDiscountRuleSchema } from "@/modules/billing/schemas/discount-rule.schema";
import { createDiscountRule, discountCodeExistsInOrg } from "@/modules/billing/repositories/discount-rule.repository";
import type { DiscountRule } from "@/modules/billing/types";

export class CreateDiscountRuleCommand extends BaseCommand<CreateDiscountRuleSchema, DiscountRule> {
  async validate(): Promise<void> {
    const result = createDiscountRuleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const exists = await discountCodeExistsInOrg(this.input.code, this.context.organizationId);
    if (exists) throw new BusinessRuleError(`Já existe um desconto com o código '${this.input.code}' nesta organização.`);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.DISCOUNT_RULES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<DiscountRule> {
    const discount = await createDiscountRule({
      organizationId: this.context.organizationId,
      code: this.input.code,
      name: this.input.name,
      description: this.input.description ?? null,
      discountType: this.input.discountType,
      value: this.input.value,
      appliesTo: this.input.appliesTo ?? "ENROLLMENT",
      startDate: this.input.startDate ? new Date(this.input.startDate) : null,
      endDate: this.input.endDate ? new Date(this.input.endDate) : null,
      stackable: this.input.stackable ?? false,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "DiscountRule",
      entityId: discount.id,
      action: "discount_rule.created",
      newValues: { code: discount.code, name: discount.name, discountType: discount.discountType, value: discount.value },
    });

    return discount;
  }
}
