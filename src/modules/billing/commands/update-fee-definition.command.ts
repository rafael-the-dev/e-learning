import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { updateFeeDefinitionSchema, type UpdateFeeDefinitionSchema } from "@/modules/billing/schemas/fee-definition.schema";
import { findFeeDefinitionById, updateFeeDefinition, feeCodeExistsInOrg } from "@/modules/billing/repositories/fee-definition.repository";
import type { FeeDefinition } from "@/modules/billing/types";

export class UpdateFeeDefinitionCommand extends BaseCommand<UpdateFeeDefinitionSchema, FeeDefinition> {
  async validate(): Promise<void> {
    const result = updateFeeDefinitionSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findFeeDefinitionById(this.input.feeDefinitionId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Taxa", this.input.feeDefinitionId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("Não é possível editar uma taxa arquivada.");

    if (this.input.code && this.input.code !== existing.code) {
      const codeExists = await feeCodeExistsInOrg(this.input.code, this.context.organizationId, this.input.feeDefinitionId);
      if (codeExists) throw new BusinessRuleError(`Já existe uma taxa com o código '${this.input.code}' nesta organização.`);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.FEE_DEFINITIONS_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<FeeDefinition> {
    const { feeDefinitionId, ...rest } = this.input;
    const fee = await updateFeeDefinition(feeDefinitionId, this.context.organizationId, {
      ...rest,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "FeeDefinition",
      entityId: fee.id,
      action: "fee_definition.updated",
      newValues: { code: fee.code, name: fee.name, feeType: fee.feeType, defaultAmount: fee.defaultAmount },
    });

    return fee;
  }
}
