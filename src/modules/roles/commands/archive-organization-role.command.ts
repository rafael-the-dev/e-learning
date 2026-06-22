import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationRoleById,
  setOrganizationRoleStatus,
  countUsersWithRole,
} from "@/modules/roles/repositories/organization-role.repository";

export class ArchiveOrganizationRoleCommand extends BaseCommand<{ roleId: string }, void> {
  async validate(): Promise<void> {
    const role = await findOrganizationRoleById(this.input.roleId, this.context.organizationId);
    if (!role) throw new NotFoundError("Role", this.input.roleId);
    if (role.isSystem) {
      throw new BusinessRuleError("Não é possível arquivar uma role de sistema");
    }
    if (role.status === "ARCHIVED") {
      throw new BusinessRuleError("A role já está arquivada");
    }

    const userCount = await countUsersWithRole(this.input.roleId, this.context.organizationId);
    if (userCount > 0) {
      throw new BusinessRuleError(
        "Não é possível arquivar uma role com utilizadores atribuídos. Reatribua os utilizadores primeiro."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ORGANIZATION_ROLES_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const role = await setOrganizationRoleStatus(this.input.roleId, "ARCHIVED");

    await auditService.log(this.context, {
      entity: "Role",
      entityId: role.id,
      action: "role.archived",
      oldValues: { status: "ACTIVE" },
      newValues: { status: "ARCHIVED" },
    });
  }
}
