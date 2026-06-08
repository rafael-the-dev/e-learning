import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findFeeDefinitionById, archiveFeeDefinition } from "@/modules/billing/repositories/fee-definition.repository";

interface Input { feeDefinitionId: string }

export class ArchiveFeeDefinitionCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    if (!this.input.feeDefinitionId) throw new ValidationError("ID da taxa é obrigatório");

    const existing = await findFeeDefinitionById(this.input.feeDefinitionId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Taxa", this.input.feeDefinitionId);
    if (existing.status === "ARCHIVED") throw new BusinessRuleError("A taxa já está arquivada.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.FEE_DEFINITIONS_ARCHIVE)) throw new AuthorizationError();
  }

  async execute(): Promise<void> {
    await archiveFeeDefinition(this.input.feeDefinitionId, this.context.organizationId, this.context.userId);

    await auditService.log(this.context, {
      entity: "FeeDefinition",
      entityId: this.input.feeDefinitionId,
      action: "fee_definition.archived",
    });
  }
}
