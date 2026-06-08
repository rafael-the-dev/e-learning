import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createFeeDefinitionSchema, type CreateFeeDefinitionSchema } from "@/modules/billing/schemas/fee-definition.schema";
import { createFeeDefinition, feeCodeExistsInOrg } from "@/modules/billing/repositories/fee-definition.repository";
import type { FeeDefinition } from "@/modules/billing/types";

export class CreateFeeDefinitionCommand extends BaseCommand<CreateFeeDefinitionSchema, FeeDefinition> {
  async validate(): Promise<void> {
    const result = createFeeDefinitionSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const exists = await feeCodeExistsInOrg(this.input.code, this.context.organizationId);
    if (exists) throw new BusinessRuleError(`Já existe uma taxa com o código '${this.input.code}' nesta organização.`);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.FEE_DEFINITIONS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<FeeDefinition> {
    const fee = await createFeeDefinition({
      organizationId: this.context.organizationId,
      code: this.input.code,
      name: this.input.name,
      description: this.input.description ?? null,
      feeType: this.input.feeType,
      defaultAmount: this.input.defaultAmount,
      appliesTo: this.input.appliesTo ?? "ENROLLMENT",
      isMandatory: this.input.isMandatory ?? false,
      priority: this.input.priority ?? 7,
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "FeeDefinition",
      entityId: fee.id,
      action: "fee_definition.created",
      newValues: { code: fee.code, name: fee.name, feeType: fee.feeType, defaultAmount: fee.defaultAmount },
    });

    return fee;
  }
}
